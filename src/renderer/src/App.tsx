import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  addColumn,
  addConnector,
  addImageCard,
  imageCardSize,
  addSticker,
  addSubboard,
  addTextCard,
  addTodoCard,
  breadcrumb,
  createEmptyDocument,
  deleteCards,
  deleteConnectors,
  getBoard,
  moveCards,
  renameBoard,
  resizeCards,
  setNoteColors,
  setTheme,
  updateText,
  updateViewport,
} from '../../shared/boardOps';
import { relayoutColumn, renameColumn, setColumnWidth, settleCardDrop, toggleColumn } from '../../shared/columns';
import { addCanvasLine, anchorPosition, deleteLines, snapAnchor, updateLine } from '../../shared/lines';
import { addLinkCard, copyCards, pasteClip, reorderCards, updateLink, type Clip } from '../../shared/clipboard';
import { normalizeUrl } from '../../shared/document';
import { searchDocument, type SearchHit } from '../../shared/search';
import { addSketchCard, addStroke, removeLastStroke } from '../../shared/sketch';
import { addShapeCard, addSwatchCard, setShapeText, updateSwatch } from '../../shared/shapes';
import { freeSpot } from '../../shared/snap';
import { ATTACHMENT_TYPES, addFileCard, extensionOf } from '../../shared/attachments';
import { addTableCard, addTableColumn, addTableRow, removeTableColumn, removeTableRow, setCell } from '../../shared/table';
import type { ShapeKind } from '../../shared/model';
import { TEMPLATES, insertTemplate, type TemplateName } from '../../shared/templates';
import { addTodoItem, deleteTodoItem, setTodoItemText, setTodoTitle, toggleTodoItem } from '../../shared/todos';
import { serializeDocument, validateDocument } from '../../shared/document';
import { placementTopLeft, windowTitle } from '../../shared/gestures';
import markUrl from '../../../assets/brand/mark.png';
import {
  commitHistory,
  contentSignature,
  createHistory,
  endGesture,
  keepViewports,
  redoHistory,
  replacePresent,
  sameContent,
  undoHistory,
  type History,
} from '../../shared/history';
import { NOTE_COLOR_NAMES, NOTE_COLOR_ORDER, NOTE_COLORS, defaultSizeFor } from '../../shared/limits';
import type { LineAnchor, NoteColor, StickerKind, TextStyle, WhiteboardDocument } from '../../shared/model';
import type { RecentBoard, TrashEntry } from '../../shared/ipc';
import { plain } from '../../shared/search';
import { buildDemoDocument, drawSamplePng } from './demo';
import { BoardCanvas, type PlacementApi } from './components/BoardCanvas';
import { bufferEarlyTyping, clearEarlyTyping, requestCellFocus, type CardLookup } from './components/cards';
import {
  IconArrow,
  IconBoard,
  IconColumn,
  IconLink,
  IconPen,
  IconHeading,
  IconImage,
  IconMore,
  IconNote,
  IconRedo,
  IconSelect,
  IconSubheading,
  IconTodo,
  IconUndo,
} from './components/icons';

type Tool = 'select' | 'note' | 'heading' | 'subheading' | 'image' | 'column' | 'todo' | 'line' | 'subboard' | 'link' | 'draw';

type TrashMarker = { id: string | null; inFlight: boolean; inTrash: boolean; clip: string; title: string; count: number; pastLength: number };

type ContextTarget = { kind: 'card'; id: string } | { kind: 'pane' };
type ContextMenuState = { target: ContextTarget; ids: string[]; screen: { x: number; y: number }; point: { x: number; y: number } };
type LinkPrompt = { screen: { x: number; y: number }; point: { x: number; y: number }; editId: string | null; value: string; error: string | null };
type Toast = { id: number; text: string; undo: boolean };

/** Single-key tool shortcuts (no modifier), shown in the tooltips. */
const TOOL_KEYS: Record<string, Tool> = { v: 'select', n: 'note', t: 'heading', u: 'subheading', k: 'link', s: 'column', a: 'todo', l: 'line', b: 'subboard', p: 'draw' };

export function App() {
  if (!window.whiteboard) {
    return (
      <div className="fatal">
        <h1>FocusBoard</h1>
        <p>Diese Fläche läuft in der Desktop-App.</p>
      </div>
    );
  }
  return <Workbench />;
}

function Workbench() {
  const api = window.whiteboard!;
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === '1';
  const queryTheme = params.get('theme') === 'dark' ? 'dark' : params.get('theme') === 'light' ? 'light' : null;
  const [hist, setHist] = useState<History<WhiteboardDocument>>(() => createHistory(createEmptyDocument()));
  const doc = hist.present;
  const [boardId, setBoardId] = useState(doc.rootBoardId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [tool, setTool] = useState<Tool>('select');
  const [moreOpen, setMoreOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [savedSig, setSavedSig] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow');
  const [lineDraft, setLineDraft] = useState<LineAnchor | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [headerDraft, setHeaderDraft] = useState('Hauptboard');
  const [autosavedAt, setAutosavedAt] = useState<Date | null>(null);
  const [selectRequest, setSelectRequest] = useState<{ token: number; ids: string[] | 'all' }>({ token: 0, ids: [] });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<LinkPrompt | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [introStep, setIntroStep] = useState<number | null>(() =>
    (params.get('e2e') === '1' && params.get('intro') !== '1') || params.get('demo') === '1' || readPref('focusboard-intro-done') === '1' ? null : 0,
  );
  const [recent, setRecent] = useState<RecentBoard[]>([]);
  const [trash, setTrash] = useState<TrashEntry[] | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(() => readPref('focusboard-minimap') === '1');
  const [font, setFont] = useState<'hand' | 'clear'>(() => (readPref('focusboard-font') === 'clear' ? 'clear' : 'hand'));
  const [searchQuery, setSearchQuery] = useState('');
  const [centerRequest, setCenterRequest] = useState({ token: 0, x: 0, y: 0 });
  const clipRef = useRef<{ token: string; clip: Clip } | null>(null);
  /** The last deletion's trash entry, so undo can take it out of the trash again (and redo put it back). */
  const lastTrash = useRef<TrashMarker | null>(null);
  const [morePos, setMorePos] = useState<{ left: number; top: number } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const attachInput = useRef<HTMLInputElement>(null);
  // After opening, measure the menu and move it up just enough to fit inside the window.
  useLayoutEffect(() => {
    const menu = moreRef.current;
    if (!moreOpen || !menu || !morePos) return;
    const rect = menu.getBoundingClientRect();
    const top = Math.max(8, Math.min(morePos.top, window.innerHeight - rect.height - 8));
    if (top !== morePos.top) setMorePos({ ...morePos, top });
  }, [moreOpen, morePos]);
  const histRef = useRef(hist);
  histRef.current = hist;
  const boardRef = useRef(boardId);
  boardRef.current = boardId;
  const editingRef = useRef(editingId);
  editingRef.current = editingId;
  const dragBefore = useRef<WhiteboardDocument | null>(null);
  const editBefore = useRef<WhiteboardDocument | null>(null);
  const placementRef = useRef<PlacementApi | null>(null);
  /** A text card created by the last click; it is discarded if it is left empty. */
  const freshCard = useRef<{ id: string; pastLength: number } | null>(null);
  const current = getBoard(doc, boardId) ?? getBoard(doc, doc.rootBoardId)!;
  const baseline = useRef<string | null>(null);
  if (baseline.current === null) baseline.current = contentSignature(doc);
  const signature = useMemo(() => contentSignature(doc), [doc]);
  const dirty = signature !== (savedSig ?? baseline.current);

  useEffect(() => {
    document.documentElement.dataset.theme = doc.theme;
    localStorage.setItem('whiteboard-theme', doc.theme);
  }, [doc.theme]);

  useEffect(() => {
    document.documentElement.dataset.font = font;
    writePref('focusboard-font', font);
    // Text cards measure their height; let them re-measure with the new (and fully loaded) font.
    setSyncToken((value) => value + 1);
    void document.fonts?.ready.then(() => setSyncToken((value) => value + 1));
  }, [font]);

  useEffect(() => {
    writePref('focusboard-minimap', showMiniMap ? '1' : '0');
  }, [showMiniMap]);

  useEffect(() => {
    api.setDirty(dirty);
    api.setWindowTitle(windowTitle(fileName, dirty));
  }, [api, dirty, fileName]);

  useEffect(() => {
    setHeaderDraft(current.title);
  }, [current.id, current.title]);

  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  useEffect(() => {
    if (demo) {
      const dataUrl = drawSamplePng();
      const sample = buildDemoDocument(dataUrl, queryTheme ?? 'light');
      const validated = validateDocument(serializeDocument(sample));
      if (validated.ok) {
        setHist(createHistory(validated.doc));
        setBoardId(validated.doc.rootBoardId);
        setSavedSig(contentSignature(validated.doc));
        setSyncToken((value) => value + 1);
      }
      return;
    }
    const stored = localStorage.getItem('whiteboard-theme');
    if (!queryTheme && (stored === 'dark' || stored === 'light')) {
      setHist((history) => replacePresent(history, { ...history.present, theme: stored }));
    }
    refreshRecent();
    void openPendingFile(false);
    void api.readRecovery().then((result) => {
      if (result.ok && !result.missing) setRecovery(result.json);
    });
  }, [api, demo, queryTheme]);

  useEffect(() => {
    // Keeps running while the restore prompt is open: the main process kept a copy of the earlier session.
    if (demo || !dirty) return;
    const timer = window.setTimeout(() => {
      void api.writeRecovery(serializeDocument(histRef.current.present)).then((result) => {
        if (result.ok) setAutosavedAt(new Date());
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [api, doc, demo, dirty]);

  // Once the board lives in a file, changes are written to that file automatically (like Milanote).
  useEffect(() => {
    if (demo || !fileName || !dirty || editingId) return;
    const timer = window.setTimeout(() => void save(false), 1500);
    return () => window.clearTimeout(timer);
  }, [doc, fileName, dirty, editingId, demo]);

  function live(next: WhiteboardDocument) {
    histRef.current = replacePresent(histRef.current, next);
    setHist(histRef.current);
  }

  function commit(next: WhiteboardDocument) {
    histRef.current = commitHistory(histRef.current, next, sameContent);
    setHist(histRef.current);
    setSyncToken((value) => value + 1);
  }

  function undo() {
    if (editingRef.current) return;
    setToast(null);
    // Undoing the deletion brings the cards back, so they must not stay in the trash as well.
    const trashed = lastTrash.current;
    if (trashed?.inTrash && histRef.current.past.length === trashed.pastLength) {
      trashed.inTrash = false;
      // If the trash has not confirmed yet, the entry is removed as soon as it does (see sendToTrash).
      if (trashed.id && !trashed.inFlight) {
        void api.trashDelete(trashed.id);
        trashed.id = null;
      }
    }
    const next = undoHistory(histRef.current);
    histRef.current = { ...next, present: keepViewports(next.present, histRef.current.present) };
    setHist(histRef.current);
    setEditingId(null);
    setSelectedLine(null);
    setSyncToken((value) => value + 1);
  }

  function redo() {
    if (editingRef.current) return;
    const trashed = lastTrash.current;
    if (trashed && !trashed.inTrash && histRef.current.past.length === trashed.pastLength - 1 && histRef.current.future.length > 0) {
      trashed.inTrash = true;
      if (!trashed.inFlight && !trashed.id) sendToTrash(trashed);
    }
    const next = redoHistory(histRef.current);
    histRef.current = { ...next, present: keepViewports(next.present, histRef.current.present) };
    setHist(histRef.current);
    setSelectedLine(null);
    setSyncToken((value) => value + 1);
  }

  function beginEdit(id: string) {
    if (!editBefore.current) editBefore.current = histRef.current.present;
    setEditingId(id);
    setTool('select');
    setSyncToken((value) => value + 1);
  }

  function finishEdit() {
    clearEarlyTyping();
    const before = editBefore.current;
    const editedId = editingRef.current;
    const fresh = freshCard.current;
    editBefore.current = null;
    freshCard.current = null;
    setEditingId(null);
    editingRef.current = null;
    if (fresh && fresh.id === editedId && dropIfEmpty(fresh)) {
      setSyncToken((value) => value + 1);
      return;
    }
    if (before) {
      histRef.current = endGesture(histRef.current, before, histRef.current.present, sameContent);
      setHist(histRef.current);
    }
    setSyncToken((value) => value + 1);
  }

  /** Removes a just-created text card that is still empty, as if it had never been placed. */
  function dropIfEmpty(fresh: { id: string; pastLength: number }): boolean {
    const present = histRef.current.present;
    const board = getBoard(present, boardRef.current);
    const card = board?.cards.find((item) => item.id === fresh.id);
    const empty = card?.type === 'text' ? card.text.trim() === '' : card?.type === 'sketch' ? card.strokes.length === 0 : false;
    if (!board || !card || !empty) return false;
    const removed = deleteCards(present, board.id, [card.id]);
    if (!removed.ok) return false;
    let next = removed.doc;
    const columnId = card.type !== 'column' ? card.columnId : null;
    if (columnId) {
      const after = getBoard(next, board.id);
      if (after) next = { ...next, boards: next.boards.map((item) => (item.id === after.id ? relayoutColumn(after, columnId) : item)) };
    }
    histRef.current = { past: histRef.current.past.slice(0, fresh.pastLength), present: next, future: [] };
    setHist(histRef.current);
    setFocusId(null);
    return true;
  }

  function chooseTool(next: Tool) {
    setTool(next);
    setLineDraft(null);
    setMoreOpen(false);
  }

  function createAt(kind: 'note' | 'heading' | 'subheading' | 'subboard' | 'column' | 'todo' | 'line' | 'link' | 'draw' | 'comment', point: { x: number; y: number }) {
    if (kind === 'line') {
      placeLine(point);
      return;
    }
    if (kind === 'link') {
      openLinkPrompt(point, null, '');
      setTool('select');
      return;
    }
    if (kind === 'draw') {
      if (editingRef.current) finishEdit();
      const result = addSketchCard(histRef.current.present, boardRef.current, point);
      if (!result.ok) {
        setBanner(result.error);
        return;
      }
      const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
      const settled = created ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
      const pastLength = histRef.current.past.length;
      commit(settled.ok ? settled.doc : result.doc);
      if (created) {
        setFocusId(created.id);
        beginEdit(created.id);
        freshCard.current = { id: created.id, pastLength };
      }
      return;
    }
    if (kind === 'column') {
      const result = addColumn(histRef.current.present, boardRef.current, point);
      if (!result.ok) {
        setBanner(result.error);
        return;
      }
      const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
      commit(result.doc);
      if (created) setFocusId(created.id);
      setTool('select');
      return;
    }
    if (kind === 'todo') {
      const result = addTodoCard(histRef.current.present, boardRef.current, point);
      if (!result.ok) {
        setBanner(result.error);
        return;
      }
      const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
      const settled = created ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
      commit(settled.ok ? settled.doc : result.doc);
      if (created) setFocusId(created.id);
      setTool('select');
      return;
    }
    const style: TextStyle = kind === 'heading' || kind === 'subheading' || kind === 'comment' ? kind : 'note';
    if (kind === 'subboard') {
        const result = addSubboard(histRef.current.present, boardRef.current, 'Neues Board', { x: point.x, y: point.y });
      if (!result.ok) {
        setBanner(result.error);
        return;
      }
      const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
      const settled = created ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
      commit(settled.ok ? settled.doc : result.doc);
      if (created) {
        setFocusId(created.id);
        beginEdit(created.id);
      }
      return;
    }
    const result = addTextCard(
      histRef.current.present,
      boardRef.current,
      '',
      { x: point.x, y: point.y },
      undefined,
      { style, color: style === 'note' ? noteColor : null },
    );
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    const settled = created ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
    const next = settled.ok ? settled.doc : result.doc;
    if (editingRef.current) finishEdit();
    const pastLength = histRef.current.past.length;
    commit(next);
    if (created) {
      setFocusId(created.id);
      beginEdit(created.id);
      freshCard.current = { id: created.id, pastLength };
    }
  }

  function placeLine(point: { x: number; y: number }) {
    const board = getBoard(histRef.current.present, boardRef.current);
    if (!board) return;
    const anchor = snapAnchor(point, board.cards, board.viewport.zoom);
    if (!lineDraft) {
      setLineDraft(anchor);
      setTool('line');
      return;
    }
    const result = addCanvasLine(histRef.current.present, boardRef.current, lineDraft, anchor);
    if (!result.ok) setBanner(result.error);
    else commit(result.doc);
    setLineDraft(null);
    setTool('select');
  }

  function drawLine(start: { x: number; y: number }, end: { x: number; y: number }) {
    if (lineDraft) return;
    const board = getBoard(histRef.current.present, boardRef.current);
    if (!board) return;
    const result = addCanvasLine(
      histRef.current.present,
      boardRef.current,
      snapAnchor(start, board.cards, board.viewport.zoom),
      snapAnchor(end, board.cards, board.viewport.zoom),
    );
    if (!result.ok) setBanner(result.error);
    else commit(result.doc);
    setTool('select');
  }

  async function addImage(point?: { x: number; y: number }) {
    const picked = await api.pickImage();
    if (!picked.ok) {
      setBanner(picked.error);
      return;
    }
    if (picked.canceled) return;
    const natural = await imageSize(picked.dataUrl);
    const center = point ?? placementRef.current?.center() ?? { x: 180, y: 140 };
    const position = point ?? placementTopLeft(center, imageCardSize(natural), 0);
    const result = addImageCard(histRef.current.present, boardRef.current, picked, position, undefined, natural);
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    commit(result.doc);
    if (created) setFocusId(created.id);
    setTool('select');
    setMoreOpen(false);
  }

  function showToast(text: string, undoable = false) {
    setToast({ id: Date.now(), text, undo: undoable });
  }

  function cardsOnBoard(ids: string[]): string[] {
    const board = getBoard(histRef.current.present, boardRef.current);
    const known = new Set(board?.cards.map((card) => card.id) ?? []);
    return ids.filter((id) => known.has(id));
  }

  function selectCards(ids: string[] | 'all') {
    setSelectRequest((request) => ({ token: request.token + 1, ids }));
    if (ids !== 'all') setSelectedIds(ids);
  }

  /** Deletes cards with the same confirmation as the Delete key and offers undo. */
  async function deleteWithConfirm(ids: string[]): Promise<string[]> {
    const board = getBoard(histRef.current.present, boardRef.current);
    const present = cardsOnBoard(ids);
    if (!board || present.length === 0) return [];
    const titles = board.cards.flatMap((card) => {
      if (!present.includes(card.id) || card.type !== 'board') return [];
      return [getBoard(histRef.current.present, card.boardId)?.title ?? 'Unterboard'];
    });
    if (titles.length > 0 && !(await api.confirmDeleteBoards(titles))) return [];
    const result = deleteCards(histRef.current.present, board.id, present);
    if (!result.ok) {
      setBanner(result.error);
      return [];
    }
    // Keep a copy in the app's trash so it can come back even after the program was closed.
    const clip = copyCards(histRef.current.present, board.id, present);
    let entry: TrashMarker | null = null;
    if (clip) {
      entry = { id: null, inFlight: true, inTrash: true, clip: JSON.stringify(clip), title: trashTitle(clip, (id) => getBoard(histRef.current.present, id)?.title ?? ''), count: present.length, pastLength: 0 };
      sendToTrash(entry);
    }
    commit(result.doc);
    if (entry) {
      entry.pastLength = histRef.current.past.length;
      lastTrash.current = entry;
    }
    setSelectedIds([]);
    showToast(present.length === 1 ? 'Karte gelöscht' : `${present.length} Karten gelöscht`, true);
    return present;
  }

  /** Plain-text version of the copied cards, for pasting into other programs. */
  function clipText(clip: Clip): string {
    return clip.cards
      .flatMap((card) => {
        if (card.type === 'text') return [card.text];
        if (card.type === 'todo') return [card.title, ...card.items.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`)];
        if (card.type === 'link') return [card.url];
        if (card.type === 'shape') return [card.text];
        if (card.type === 'file') return [card.name];
        if (card.type === 'table') return [card.rows.map((row) => row.join('\t')).join('\n')];
        if (card.type === 'swatch') return [`${card.label} ${card.color.toUpperCase()}`.trim()];
        if (card.type === 'column') return [card.title];
        if (card.type === 'board') return [getBoard(histRef.current.present, card.boardId)?.title ?? ''];
        return [];
      })
      .filter(Boolean)
      .join('\n\n');
  }

  function copySelection(data: DataTransfer | null): boolean {
    const ids = cardsOnBoard(selectedIds);
    const clip = copyCards(histRef.current.present, boardRef.current, ids);
    if (!clip) return false;
    const token = `focusboard-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    clipRef.current = { token, clip };
    if (data) {
      data.setData('text/plain', clipText(clip) || ' ');
      data.setData('application/x-focusboard', token);
    }
    return true;
  }

  function pasteClipAt(clip: Clip, at: { x: number; y: number }) {
    finishEdit();
    const result = pasteClip(histRef.current.present, boardRef.current, clip, at);
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    commit(result.doc);
    selectCards(result.cardIds);
  }

  function pastePoint(): { x: number; y: number } {
    return pointerRef.current ?? placementRef.current?.center() ?? { x: 180, y: 140 };
  }

  function duplicateSelection() {
    const ids = cardsOnBoard(selectedIds);
    const clip = copyCards(histRef.current.present, boardRef.current, ids);
    if (!clip) return;
    const minX = Math.min(...clip.cards.map((card) => card.x));
    const minY = Math.min(...clip.cards.map((card) => card.y));
    pasteClipAt(clip, { x: minX + 32, y: minY + 32 });
  }

  function addTextAt(text: string, point: { x: number; y: number }) {
    const result = addTextCard(histRef.current.present, boardRef.current, text.slice(0, 8000), point, undefined, { style: 'note', color: noteColor });
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    commit(result.doc);
    if (created) selectCards([created.id]);
  }

  function addLinkAt(url: string, point: { x: number; y: number }): string | null {
    const result = addLinkCard(histRef.current.present, boardRef.current, url, point);
    if (!result.ok) return result.error;
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    const settled = created ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
    commit(settled.ok ? settled.doc : result.doc);
    if (created) selectCards([created.id]);
    return null;
  }

  /** Adds dropped or pasted image files in a loose grid, keeping each picture's aspect ratio. */
  async function addImageFiles(files: File[], at: { x: number; y: number }) {
    const board = files.find((file) => /\.(json|focusboard)$/i.test(file.name));
    if (board) {
      void openDroppedBoard(board);
      return;
    }
    const images = files.filter((file) => /^image\/(png|jpeg|gif|webp)$/.test(file.type));
    const attachments = files.filter((file) => !images.includes(file) && ATTACHMENT_TYPES[extensionOf(file.name)]);
    const refused = files.filter((file) => !images.includes(file) && !attachments.includes(file));
    if (refused.length > 0) {
      setBanner(`${refused.map((file) => file.name).join(', ')}: Dieser Dateityp kann nicht angehängt werden (z. B. Programme und Skripte sind aus Sicherheitsgründen ausgeschlossen).`);
    }
    if (images.length === 0 && attachments.length === 0) return;
    const created: string[] = [];
    let present = histRef.current.present;
    for (const [index, file] of attachments.entries()) {
      if (file.size > 10 * 1024 * 1024) {
        setBanner(`${file.name}: Die Datei ist zu groß (höchstens 10 MB).`);
        continue;
      }
      const dataUrl = await readAsDataUrl(file);
      if (!dataUrl) continue;
      const slot = images.length + index;
      const position = { x: at.x + (slot % 4) * 300, y: at.y + Math.floor(slot / 4) * 300 };
      const result = addFileCard(present, boardRef.current, { name: file.name, dataUrl }, position);
      if (!result.ok) {
        setBanner(result.error);
        continue;
      }
      present = result.doc;
      const card = getBoard(present, boardRef.current)?.cards.at(-1);
      if (card) created.push(card.id);
    }
    for (const [index, file] of images.entries()) {
      const dataUrl = await readAsDataUrl(file);
      if (!dataUrl) {
        setBanner('Die Datei konnte nicht gelesen werden.');
        continue;
      }
      const natural = await imageSize(dataUrl);
      const position = { x: at.x + (index % 4) * 300, y: at.y + Math.floor(index / 4) * 300 };
      const name = file.name || `Bild.${file.type.split('/')[1] ?? 'png'}`;
      const result = addImageCard(present, boardRef.current, { fileName: name, dataUrl }, position, undefined, natural);
      if (!result.ok) {
        setBanner(result.error);
        continue;
      }
      present = result.doc;
      const card = getBoard(present, boardRef.current)?.cards.at(-1);
      if (card) created.push(card.id);
    }
    if (created.length === 0) return;
    commit(present);
    selectCards(created);
  }

  function openLinkPrompt(point: { x: number; y: number }, editId: string | null, value: string) {
    const flow = document.querySelector('.react-flow')?.getBoundingClientRect();
    const view = getBoard(histRef.current.present, boardRef.current)?.viewport ?? { x: 0, y: 0, zoom: 1 };
    const screen = {
      x: Math.min(window.innerWidth - 340, Math.max(8, (flow?.left ?? 0) + point.x * view.zoom + view.x)),
      y: Math.min(window.innerHeight - 120, Math.max(8, (flow?.top ?? 0) + point.y * view.zoom + view.y)),
    };
    setLinkPrompt({ screen, point, editId, value, error: null });
  }

  function submitLinkPrompt() {
    if (!linkPrompt) return;
    if (linkPrompt.editId) {
      const result = updateLink(histRef.current.present, boardRef.current, linkPrompt.editId, { url: linkPrompt.value });
      if (!result.ok) {
        setLinkPrompt({ ...linkPrompt, error: result.error });
        return;
      }
      commit(result.doc);
    } else {
      const error = addLinkAt(linkPrompt.value, linkPrompt.point);
      if (error) {
        setLinkPrompt({ ...linkPrompt, error });
        return;
      }
    }
    setLinkPrompt(null);
  }

  function openCard(id: string): boolean {
    const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
    if (card?.type === 'board') {
      lookup.openBoard(card.boardId);
      return true;
    }
    if (card?.type === 'link') {
      openLinkPrompt({ x: card.x, y: card.y }, card.id, card.url);
      return true;
    }
    if (card?.type === 'file') {
      lookup.openFile(card.id);
      return true;
    }
    return false;
  }

  /** Opens the board file the program was started with (or that a second start handed over). */
  async function openPendingFile(askFirst: boolean) {
    if (askFirst && !(await confirmIfDirty())) return;
    const opened = await api.takePendingOpen();
    if (!opened.ok) {
      setBanner(opened.error);
      return;
    }
    if (opened.canceled) return;
    loadJson(opened.json, opened.fileName, false);
    refreshRecent();
  }

  /** A board file dropped into the window is loaded as an unsaved copy (its folder is unknown here). */
  async function openDroppedBoard(file: File) {
    if (!(await confirmIfDirty())) return;
    if (file.size > 40 * 1024 * 1024) {
      setBanner('Die Datei ist zu groß (höchstens 40 MB).');
      return;
    }
    const json = await file.text();
    const validated = validateDocument(json);
    if (!validated.ok) {
      setBanner(validated.error);
      return;
    }
    loadJson(json, null, true);
    showToast(`„${file.name}“ geladen – mit „Speichern unter“ sichern`);
  }

  /** Stores a deletion in the trash; reconciles with undo/redo that happened while the trash was still writing. */
  function sendToTrash(marker: TrashMarker) {
    marker.inFlight = true;
    void api.trashAdd({ title: marker.title, count: marker.count, clip: marker.clip }).then((id) => {
      marker.inFlight = false;
      marker.id = id;
      if (!marker.inTrash && id) {
        void api.trashDelete(id);
        marker.id = null;
      }
    });
  }

  function openTrash() {
    setFileOpen(false);
    void api.trashList().then(setTrash, () => setTrash([]));
  }

  async function restoreFromTrash(entry: TrashEntry) {
    const taken = await api.trashTake(entry.id);
    if (!taken.ok) {
      setBanner(taken.error);
      openTrash();
      return;
    }
    try {
      const clip = JSON.parse(taken.clip) as Clip;
      const center = placementRef.current?.center() ?? { x: 180, y: 140 };
      const result = pasteClip(histRef.current.present, boardRef.current, clip, freeSpot({ x: center.x - 120, y: center.y - 80 }, { width: 240, height: 160 }, current.cards));
      // Everything coming back from disk is checked like a file being opened.
      if (!result.ok || !validateDocument(serializeDocument(result.doc)).ok) throw new Error('invalid');
      commit(result.doc);
      selectCards(result.cardIds);
      showToast(`Wiederhergestellt: ${entry.title}`);
    } catch {
      setBanner('Dieser Eintrag konnte nicht wiederhergestellt werden.');
      void api.trashAdd({ title: entry.title, count: entry.count, clip: taken.clip });
    }
    openTrash();
  }

  function toggleTheme() {
    const result = setTheme(histRef.current.present, histRef.current.present.theme === 'dark' ? 'light' : 'dark');
    if (result.ok) live(result.doc);
  }

  function toggleFont() {
    setFont((value) => (value === 'hand' ? 'clear' : 'hand'));
  }

  function openPalette() {
    setFileOpen(false);
    setMoreOpen(false);
    setContextMenu(null);
    setPaletteOpen(true);
  }

  function finishIntro() {
    setIntroStep(null);
    writePref('focusboard-intro-done', '1');
  }

  /** Every command of the app in one list: used by the command palette (Ctrl+K) and the shortcut overview (F1). */
  function commands(): Command[] {
    const tool = (id: Tool, label: string, key: string): Command => ({ id: `tool-${id}`, group: 'Werkzeuge', label, shortcut: key, run: () => chooseTool(id) });
    return [
      tool('note', 'Notiz anlegen', 'N'),
      tool('heading', 'Große Überschrift', 'T'),
      tool('subheading', 'Kleine Überschrift', 'U'),
      { id: 'image', group: 'Werkzeuge', label: 'Bild einfügen', shortcut: 'I', run: () => void addImage() },
      tool('link', 'Link anlegen', 'K'),
      tool('subboard', 'Unterboard anlegen', 'B'),
      tool('column', 'Spalte anlegen', 'S'),
      tool('todo', 'Aufgabenliste anlegen', 'A'),
      tool('draw', 'Zeichnen', 'P'),
      tool('line', 'Linie zeichnen', 'L'),
      { id: 'table', group: 'Werkzeuge', label: 'Tabelle einfügen', run: () => addFromMore('table') },
      { id: 'swatch', group: 'Werkzeuge', label: 'Farbfeld einfügen', run: () => addFromMore('swatch') },
      { id: 'shape', group: 'Werkzeuge', label: 'Form einfügen (Rechteck)', run: () => addFromMore('rect') },
      { keywords: 'anhang pdf word excel dokument', id: 'attach', group: 'Werkzeuge', label: 'Datei anhängen', run: () => attachInput.current?.click() },
      ...TEMPLATES.map((template): Command => ({ id: `template-${template.name}`, group: 'Vorlagen', label: `Vorlage: ${template.label}`, run: () => addTemplate(template.name) })),
      { id: 'undo', group: 'Bearbeiten', label: 'Rückgängig', shortcut: 'Strg+Z', run: undo },
      { id: 'redo', group: 'Bearbeiten', label: 'Wiederholen', shortcut: 'Strg+Y', run: redo },
      { id: 'copy', group: 'Bearbeiten', label: 'Kopieren', shortcut: 'Strg+C', run: () => copySelection(null) },
      { id: 'paste', group: 'Bearbeiten', label: 'Einfügen', shortcut: 'Strg+V', run: () => clipRef.current && pasteClipAt(clipRef.current.clip, pastePoint()) },
      { id: 'duplicate', group: 'Bearbeiten', label: 'Duplizieren', shortcut: 'Strg+D', run: duplicateSelection },
      { id: 'select-all', group: 'Bearbeiten', label: 'Alles auswählen', shortcut: 'Strg+A', run: () => selectCards('all') },
      { keywords: 'entfernen weg', id: 'delete', group: 'Bearbeiten', label: 'Auswahl löschen', shortcut: 'Entf', run: () => void deleteWithConfirm(selectedIds) },
      { keywords: 'finden suche', id: 'search', group: 'Ansicht', label: 'In allen Boards suchen', shortcut: 'Strg+F', run: () => setSearchOpen(true) },
      { keywords: 'zoom einpassen überblick', id: 'fit', group: 'Ansicht', label: 'Alles anzeigen', run: () => void placementRef.current?.fitAll() },
      { keywords: 'dunkel hell modus nacht farbe thema', id: 'theme', group: 'Ansicht', label: histRef.current.present.theme === 'dark' ? 'Helles Thema' : 'Dunkles Thema', run: toggleTheme },
      { keywords: 'schrift handschrift klar lesbar', id: 'font', group: 'Ansicht', label: font === 'hand' ? 'Klare Schrift' : 'Handschrift', run: toggleFont },
      { keywords: 'karte übersicht minimap', id: 'minimap', group: 'Ansicht', label: showMiniMap ? 'Übersichtskarte ausblenden' : 'Übersichtskarte einblenden', run: () => setShowMiniMap((value) => !value) },
      { id: 'home', group: 'Ansicht', label: 'Zum Hauptboard', run: () => lookup.openBoard(doc.rootBoardId) },
      { id: 'new', group: 'Datei', label: 'Neues Board', shortcut: 'Strg+N', run: () => void newDocument() },
      { id: 'open', group: 'Datei', label: 'Öffnen …', shortcut: 'Strg+O', run: () => void openDocument() },
      { id: 'save', group: 'Datei', label: 'Speichern', shortcut: 'Strg+S', run: () => void save(false) },
      { id: 'save-as', group: 'Datei', label: 'Speichern unter …', shortcut: 'Strg+Umschalt+S', run: () => void save(true) },
      { keywords: 'bild png foto teilen', id: 'export-png', group: 'Datei', label: 'Als Bild exportieren (PNG)', run: () => void exportImage('png') },
      { keywords: 'pdf drucken teilen', id: 'export-pdf', group: 'Datei', label: 'Als PDF exportieren', run: () => void exportImage('pdf') },
      { keywords: 'gelöscht wiederherstellen papierkorb', id: 'trash', group: 'Datei', label: 'Papierkorb öffnen', run: openTrash },
      { id: 'intro', group: 'Hilfe', label: 'Einführung zeigen', run: () => setIntroStep(0) },
      { id: 'help-snap', group: 'Hilfe', label: 'Frei platzieren ohne Einrasten', shortcut: 'Alt beim Ziehen', run: () => undefined },
      { id: 'help-pan', group: 'Hilfe', label: 'Fläche verschieben', shortcut: 'Leertaste + Ziehen / Mausrad', run: () => undefined },
      { id: 'help-zoom', group: 'Hilfe', label: 'Zoomen', shortcut: 'Strg + Mausrad', run: () => undefined },
      { id: 'help-edit', group: 'Hilfe', label: 'Karte bearbeiten', shortcut: 'Doppelklick / Enter / F2', run: () => undefined },
    ];
  }

  function refreshRecent() {
    void api.listRecent().then(setRecent, () => setRecent([]));
  }

  async function openRecentBoard(entry: RecentBoard) {
    setFileOpen(false);
    if (!(await confirmIfDirty())) return;
    const opened = await api.openRecent(entry.path);
    if (!opened.ok) {
      setBanner(opened.error);
      refreshRecent();
      return;
    }
    if (opened.canceled) return;
    loadJson(opened.json, opened.fileName, false);
    await api.clearRecovery();
    refreshRecent();
  }

  async function exportImage(format: 'png' | 'pdf' = 'png') {
    setFileOpen(false);
    finishEdit();
    const placement = placementRef.current;
    const flow = document.querySelector('.react-flow');
    if (!placement || !flow || current.cards.length === 0) {
      setBanner('Auf diesem Board gibt es nichts zu exportieren.');
      return;
    }
    selectCards([]);
    setSelectedLine(null);
    document.documentElement.classList.add('exporting');
    const before = await placement.fitAll();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = flow.getBoundingClientRect();
    const result = await api.exportPng({ x: rect.left, y: rect.top, width: rect.width, height: rect.height, name: current.title, format });
    document.documentElement.classList.remove('exporting');
    placement.restore(before);
    if (!result.ok) setBanner(result.error);
    else if (!result.canceled) showToast(`${format === 'pdf' ? 'Als PDF' : 'Als Bild'} gespeichert: ${result.fileName}`);
  }

  function jumpTo(hit: SearchHit) {
    finishEdit();
    if (hit.boardId !== boardRef.current) lookup.openBoard(hit.boardId);
    setFocusId(hit.cardId);
    setSyncToken((value) => value + 1);
    if (hit.center) setCenterRequest((request) => ({ token: request.token + 1, x: hit.center!.x, y: hit.center!.y }));
  }

  function addTemplate(name: TemplateName) {
    setMoreOpen(false);
    const center = placementRef.current?.center() ?? { x: 180, y: 140 };
    const result = insertTemplate(histRef.current.present, boardRef.current, name, { x: center.x - 400, y: center.y - 200 });
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    commit(result.doc);
    selectCards(result.cardIds);
  }

  function moveLineEnd(lineId: string, end: 'source' | 'target', point: { x: number; y: number }) {
    const board = getBoard(histRef.current.present, boardRef.current);
    const line = board?.lines.find((item) => item.id === lineId);
    if (!board || !line) return;
    const anchor = snapAnchor(point, board.cards, board.viewport.zoom);
    const other = end === 'source' ? line.target : line.source;
    if (anchor.kind === 'card' && other.kind === 'card' && anchor.cardId === other.cardId) {
      setBanner('Eine Linie kann nicht an beiden Enden an derselben Karte hängen.');
      return;
    }
    const result = updateLine(histRef.current.present, board.id, lineId, { [end]: anchor });
    if (result.ok) commit(result.doc);
  }

  function onDropTool(name: string, point: { x: number; y: number }) {
    if (name === 'image') {
      void addImage(point);
      return;
    }
    if (name === 'table') {
      addFromMore('table', point);
      return;
    }
    if (name === 'swatch' || name === 'shape:rect' || name === 'shape:ellipse' || name === 'shape:diamond') {
      addFromMore(name === 'swatch' ? 'swatch' : (name.slice('shape:'.length) as ShapeKind), point);
      return;
    }
    if (name.startsWith('sticker:')) {
      const kind = name.slice('sticker:'.length) as StickerKind;
      addStickerAt(kind, point);
      return;
    }
    if (name === 'note' || name === 'heading' || name === 'subheading' || name === 'column' || name === 'todo' || name === 'line' || name === 'link' || name === 'subboard' || name === 'draw' || name === 'comment') {
      createAt(name, point);
    }
  }

  /** Places a swatch or shape (from the More menu or by dragging it out) and opens it for editing. */
  function addFromMore(kind: 'swatch' | 'table' | ShapeKind, point?: { x: number; y: number }) {
    setMoreOpen(false);
    finishEdit();
    const center = point ?? placementRef.current?.center() ?? { x: 180, y: 140 };
    const size = defaultSizeFor(kind === 'swatch' ? 'swatch' : kind === 'table' ? 'table' : 'shape');
    // From the menu (no drop point) the card looks for a free spot near the middle of the view.
    const at = point ?? freeSpot({ x: center.x - size.width / 2, y: center.y - size.height / 2 }, size, current.cards.filter((card) => !(card.type !== 'column' && card.columnId)));
    const result =
      kind === 'swatch' ? addSwatchCard(histRef.current.present, boardRef.current, at)
      : kind === 'table' ? addTableCard(histRef.current.present, boardRef.current, at)
      : addShapeCard(histRef.current.present, boardRef.current, kind, at, noteColor);
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    const settled = created && point ? settleCardDrop(result.doc, boardRef.current, created.id, point) : result;
    commit(settled.ok ? settled.doc : result.doc);
    if (created) {
      setFocusId(created.id);
      if (kind === 'table') requestCellFocus(created.id, 0, 0);
      else beginEdit(created.id);
    }
  }

  function addStickerAt(kind: StickerKind, point?: { x: number; y: number }) {
    const center = point ?? placementRef.current?.center() ?? { x: 180, y: 140 };
    const position = point ?? freeSpot({ x: center.x - 52, y: center.y - 52 }, { width: 104, height: 104 }, current.cards);
    const result = addSticker(histRef.current.present, boardRef.current, kind, position);
    if (!result.ok) {
      setBanner(result.error);
      return;
    }
    const created = getBoard(result.doc, boardRef.current)?.cards.at(-1);
    commit(result.doc);
    if (created) setFocusId(created.id);
    setMoreOpen(false);
    setTool('select');
  }

  async function save(saveAs: boolean): Promise<boolean> {
    finishEdit();
    const result = await api.save({ json: serializeDocument(histRef.current.present), saveAs });
    if (!result.ok) {
      setBanner(result.error);
      return false;
    }
    if (result.canceled) return false;
    setFileName(result.fileName);
    setSavedSig(contentSignature(histRef.current.present));
    setAutosavedAt(null);
    if (saveAs || !fileName) refreshRecent();
    await api.clearRecovery();
    return true;
  }

  async function confirmIfDirty() {
    if (!dirty) return true;
    return api.confirmDiscard();
  }

  async function newDocument() {
    if (!(await confirmIfDirty())) return;
    const next = createEmptyDocument();
    if (doc.theme === 'dark') next.theme = 'dark';
    setHist(createHistory(next));
    setBoardId(next.rootBoardId);
    setFileName(null);
    setSavedSig(contentSignature(next));
    setEditingId(null);
    setFocusId(null);
    setSelectedLine(null);
    setLineDraft(null);
    setSyncToken((value) => value + 1);
    await api.clearPath();
    await api.clearRecovery();
    setFileOpen(false);
  }

  async function openDocument() {
    if (!(await confirmIfDirty())) return;
    const opened = await api.open();
    if (!opened.ok) {
      setBanner(opened.error);
      return;
    }
    if (opened.canceled) return;
    loadJson(opened.json, opened.fileName, false);
    await api.clearRecovery();
    setFileOpen(false);
  }

  function loadJson(json: string, name: string | null, keepDirty: boolean) {
    // Version 1 files had no theme of their own; they keep the current one.
    const theme = histRef.current.present.theme;
    const validated = validateDocument(json);
    if (!validated.ok) {
      setBanner(validated.error);
      return;
    }
    const next = rawVersion(json) === 1 ? { ...validated.doc, theme } : validated.doc;
    setHist(createHistory(next));
    setBoardId(next.rootBoardId);
    setFileName(name);
    setSavedSig(keepDirty ? null : contentSignature(next));
    setEditingId(null);
    setFocusId(null);
    setSelectedLine(null);
    setLineDraft(null);
    setSyncToken((value) => value + 1);
    document.documentElement.dataset.theme = next.theme;
  }

  const lookup = useMemo<CardLookup>(() => {
    const board = getBoard(histRef.current.present, boardRef.current);
    return {
      text: (id) => {
        const card = board?.cards.find((item) => item.id === id);
        return card?.type === 'text' ? card : undefined;
      },
      image: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'image' ? card : undefined;
      },
      sticker: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'sticker' ? card : undefined;
      },
      boardCard: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'board' ? card : undefined;
      },
      boardTitle: (id) => getBoard(histRef.current.present, id)?.title ?? '',
      fileUrl: (fileId) => {
        const file = histRef.current.present.files.find((item) => item.id === fileId);
        return file ? { url: file.dataUrl, name: file.fileName } : undefined;
      },
      commitText: (id, text) => {
        const result = updateText(histRef.current.present, boardRef.current, id, text);
        if (result.ok) live(result.doc);
      },
      commitTitle: (id, title) => {
        const result = renameBoard(histRef.current.present, id, title);
        if (result.ok) live(result.doc);
      },
      openBoard: (id) => {
        finishEdit();
        setBoardId(id);
        setSelectedLine(null);
        setLineDraft(null);
        setTool('select');
        setSyncToken((value) => value + 1);
      },
      finishEdit,
      column: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'column' ? card : undefined;
      },
      todo: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'todo' ? card : undefined;
      },
      toggleColumn: (id) => {
        const result = toggleColumn(histRef.current.present, boardRef.current, id);
        if (result.ok) commit(result.doc);
      },
      commitColumnTitle: (id, title) => {
        const result = renameColumn(histRef.current.present, boardRef.current, id, title);
        if (result.ok) live(result.doc);
      },
      commitTodoTitle: (id, title) => {
        const result = setTodoTitle(histRef.current.present, boardRef.current, id, title);
        if (result.ok) live(result.doc);
      },
      commitTodoItem: (cardId, itemId, text) => {
        const result = setTodoItemText(histRef.current.present, boardRef.current, cardId, itemId, text);
        if (result.ok) live(result.doc);
      },
      toggleTodo: (cardId, itemId) => {
        const result = toggleTodoItem(histRef.current.present, boardRef.current, cardId, itemId);
        if (result.ok) commit(result.doc);
      },
      addTodoAfter: (cardId, itemId) => {
        finishEdit();
        const result = addTodoItem(histRef.current.present, boardRef.current, cardId, itemId) as ReturnType<typeof addTodoItem> & { itemId?: string };
        if (!result.ok) return null;
        commit(result.doc);
        return result.itemId ?? null;
      },
      deleteTodoItem: (cardId, itemId) => {
        finishEdit();
        const result = deleteTodoItem(histRef.current.present, boardRef.current, cardId, itemId);
        if (result.ok) commit(result.doc);
      },
      swatch: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'swatch' ? card : undefined;
      },
      updateSwatch: (id, patch) => {
        const result = updateSwatch(histRef.current.present, boardRef.current, id, patch);
        if (result.ok) live(result.doc);
      },
      shape: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'shape' ? card : undefined;
      },
      commitShapeText: (id, text) => {
        const result = setShapeText(histRef.current.present, boardRef.current, id, text);
        if (result.ok) live(result.doc);
      },
      notify: (text) => showToast(text),
      file: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'file' ? card : undefined;
      },
      openFile: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        if (card?.type !== 'file') return;
        void api.openAttachment({ name: card.name, data: card.data }).then((result) => {
          if (!result.ok) setBanner(result.error);
        });
      },
      saveFile: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        if (card?.type !== 'file') return;
        void api.saveAttachment({ name: card.name, data: card.data }).then((result) => {
          if (!result.ok) setBanner(result.error);
          else if (!result.canceled) showToast(`Gespeichert: ${result.fileName}`);
        });
      },
      table: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'table' ? card : undefined;
      },
      setCell: (id, row, col, text) => {
        const result = setCell(histRef.current.present, boardRef.current, id, row, col, text);
        if (result.ok) live(result.doc);
      },
      tableOp: (id, op) => {
        finishEdit();
        const present = histRef.current.present;
        const result =
          op === 'addRow' ? addTableRow(present, boardRef.current, id)
          : op === 'addColumn' ? addTableColumn(present, boardRef.current, id)
          : op === 'removeRow' ? removeTableRow(present, boardRef.current, id)
          : removeTableColumn(present, boardRef.current, id);
        if (result.ok && !sameContent(result.doc, present)) commit(withColumnsRelaid(result.doc, boardRef.current, [id]));
      },
      copyText: (text) => {
        void api.copyText(text).then((ok) => showToast(ok ? `${text} kopiert` : 'Kopieren nicht möglich'));
      },
      sketch: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'sketch' ? card : undefined;
      },
      addStroke: (id, stroke) => {
        const result = addStroke(histRef.current.present, boardRef.current, id, stroke);
        if (!result.ok) setBanner(result.error);
        else live(result.doc);
      },
      undoStroke: (id) => {
        const result = removeLastStroke(histRef.current.present, boardRef.current, id);
        if (result.ok) live(result.doc);
      },
      link: (id) => {
        const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === id);
        return card?.type === 'link' ? card : undefined;
      },
      openLink: (url) => {
        void api.openExternal(url).then((ok) => {
          if (!ok) setBanner('Dieser Link kann nicht geöffnet werden.');
        });
      },
      fitTextHeight: (id, height) => {
        const present = histRef.current.present;
        const board = getBoard(present, boardRef.current);
        const card = board?.cards.find((item) => item.id === id);
        if (!board || !card || card.type !== 'text' || Math.abs(card.height - height) < 2) return;
        const resized = resizeCards(present, board.id, [{ id, width: card.width, height }]);
        if (!resized.ok) return;
        live(withColumnsRelaid(resized.doc, board.id, [id]));
        setSyncToken((value) => value + 1);
      },
      startEdit: (id) => beginEdit(id),
      armGesture: () => {
        if (!editBefore.current) editBefore.current = histRef.current.present;
      },
      zoom: () => getBoard(histRef.current.present, boardRef.current)?.viewport.zoom ?? 1,
      resizeColumnTo: (id, width) => {
        const result = setColumnWidth(histRef.current.present, boardRef.current, id, width);
        if (result.ok) live(result.doc);
      },
    };
  }, [doc, boardId, editingId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      if (event.key === 'Escape') {
        if (typing) return;
        // Ends drawing (or any other edit) and keeps the result as one undo step.
        if (editingRef.current) finishEdit();
        setTool('select');
        setLineDraft(null);
        setSelectedLine(null);
        setMoreOpen(false);
        setFileOpen(false);
        return;
      }
      if (typing) return;
      const meta = event.ctrlKey || event.metaKey;
      // A card was just created and its editor is not on screen yet: keep the keys for it.
      const editedCard = editingRef.current ? current.cards.find((item) => item.id === editingRef.current) : undefined;
      if (editedCard && (editedCard.type === 'text' || editedCard.type === 'shape') && !meta && !event.altKey && event.key.length === 1) {
        event.preventDefault();
        bufferEarlyTyping(event.key);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLine) {
        event.preventDefault();
        const result = deleteLines(histRef.current.present, current.id, [selectedLine]);
        if (result.ok) commit(result.doc);
        setSelectedLine(null);
        return;
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedLine(null);
        selectCards('all');
        return;
      }
      if ((meta && event.key.toLowerCase() === 'k') || event.key === 'F1') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (!meta && !event.altKey && !event.shiftKey && TOOL_KEYS[event.key.toLowerCase()]) {
        event.preventDefault();
        chooseTool(TOOL_KEYS[event.key.toLowerCase()]!);
        return;
      }
      if (!meta && !event.altKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        void addImage();
        return;
      }
      if (event.key === 'F2' && selectedIds.length === 1) {
        event.preventDefault();
        const card = current.cards.find((item) => item.id === selectedIds[0]);
        if (card?.type === 'link') openLinkPrompt({ x: card.x, y: card.y }, card.id, card.url);
        else if (card) beginEdit(card.id);
        return;
      }
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        redo();
      } else if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save(event.shiftKey);
      } else if (meta && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openDocument();
      } else if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void newDocument();
      } else if (event.key === 'Enter' && selectedIds.length === 1) {
        const card = current.cards.find((item) => item.id === selectedIds[0]);
        if (card && (card.type === 'text' || card.type === 'board' || card.type === 'shape' || card.type === 'swatch' || card.type === 'sketch')) beginEdit(card.id);
      }
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isTypingTarget(document.activeElement) || hasTextSelection()) return;
      if (copySelection(event.clipboardData)) event.preventDefault();
    };
    const onCut = (event: ClipboardEvent) => {
      if (isTypingTarget(document.activeElement) || hasTextSelection()) return;
      const ids = cardsOnBoard(selectedIds);
      if (!copySelection(event.clipboardData)) return;
      event.preventDefault();
      void deleteWithConfirm(ids);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(document.activeElement)) return;
      const data = event.clipboardData;
      if (!data) return;
      event.preventDefault();
      const at = pastePoint();
      const token = data.getData('application/x-focusboard');
      if (token && clipRef.current?.token === token) {
        pasteClipAt(clipRef.current.clip, at);
        return;
      }
      const files = [...data.files];
      if (files.length > 0) {
        void addImageFiles(files, at);
        return;
      }
      const text = data.getData('text/plain').trim();
      if (!text) {
        // Some programs copy only their own format; fall back to the last internal copy.
        if (clipRef.current) pasteClipAt(clipRef.current.clip, at);
        else showToast('In der Zwischenablage ist nichts, das eingefügt werden kann.');
        return;
      }
      const url = !/\s/.test(text) ? normalizeUrl(text) : null;
      if (url) {
        const error = addLinkAt(url, at);
        if (error) setBanner(error);
        return;
      }
      if (clipRef.current && clipText(clipRef.current.clip) === text) {
        pasteClipAt(clipRef.current.clip, at);
        return;
      }
      addTextAt(text, at);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const offs = [
      api.onMenuNew(() => void newDocument()),
      api.onMenuOpen(() => void openDocument()),
      api.onMenuSave(() => void save(false)),
      api.onMenuSaveAs(() => void save(true)),
      api.onSaveAndClose(() => void save(false).then((ok) => { if (ok) api.approveClose(); })),
      api.onOpenRequest(() => void openPendingFile(true)),
      api.onMenuCommand((command) => {
        const typing = isTypingTarget(document.activeElement);
        if (command === 'undo') {
          if (!typing) undo();
        } else if (command === 'redo') {
          if (!typing) redo();
        } else if (command === 'selectAll') {
          if (typing) document.execCommand('selectAll');
          else selectCards('all');
        } else if (command === 'duplicate') {
          if (!typing) duplicateSelection();
        } else if (command === 'delete') {
          if (typing) document.execCommand('delete');
          else if (selectedLine) {
            const result = deleteLines(histRef.current.present, current.id, [selectedLine]);
            if (result.ok) commit(result.doc);
            setSelectedLine(null);
          } else void deleteWithConfirm(selectedIds);
        }
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  useEffect(() => {
    if (params.get('e2e') !== '1') return;
    void api.loadFixture().then((result) => {
      if (result.ok && !result.missing) loadJson(result.json, 'fixture.json', false);
    });
  }, [api]);

  const crumbs = breadcrumb(doc, current.id);
  const selectedNote = current.cards.some((card) => selectedIds.includes(card.id) && ((card.type === 'text' && card.style === 'note') || card.type === 'shape'));

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          data-testid="brand-home"
          aria-label="FocusBoard, zum Hauptboard"
          onClick={() => {
            if (current.id !== doc.rootBoardId) lookup.openBoard(doc.rootBoardId);
          }}
        >
          <img src={markUrl} alt="" />
          <span>FocusBoard</span>
        </button>
        <nav className="crumbs" aria-label="Board-Pfad">
          <button type="button" disabled={!current.parentBoardId} onClick={() => current.parentBoardId && lookup.openBoard(current.parentBoardId)}>
            Zurück
          </button>
          {crumbs.map((crumb, index) => (
            <span key={crumb.id} className="crumb">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.id === current.id ? (
                <input
                  aria-label="Titel dieses Boards"
                  value={headerDraft}
                  onChange={(event) => setHeaderDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setHeaderDraft(current.title);
                      const input = event.currentTarget;
                      window.setTimeout(() => input.blur(), 0);
                    }
                  }}
                  onBlur={() => {
                    const result = renameBoard(histRef.current.present, current.id, headerDraft);
                    if (result.ok && !sameContent(result.doc, histRef.current.present)) commit(result.doc);
                  }}
                />
              ) : (
                <button type="button" onClick={() => lookup.openBoard(crumb.id)}>
                  {crumb.title}
                </button>
              )}
            </span>
          ))}
        </nav>
        <div className="top-actions">
          <button type="button" data-testid="undo" data-past={hist.past.length} aria-label="Rückgängig" disabled={hist.past.length === 0 && editingId === null} onClick={() => { if (editingRef.current) finishEdit(); undo(); }}>
            <IconUndo />
          </button>
          <button type="button" data-testid="redo" aria-label="Wiederholen" disabled={hist.future.length === 0} onClick={() => { if (editingRef.current) finishEdit(); redo(); }}>
            <IconRedo />
          </button>
          <button type="button" className="icon-button" data-testid="search-open" aria-label="Suchen (Strg+F)" title="Suchen (Strg+F)" onClick={() => setSearchOpen(true)}>
            <span aria-hidden="true">⌕</span>
          </button>
          <button type="button" className="icon-button" data-testid="palette-open" aria-label="Alle Befehle (Strg+K)" title="Alle Befehle und Tastenkürzel (Strg+K, F1)" onClick={() => openPalette()}>
            <span aria-hidden="true">⌘</span>
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="font-toggle"
            aria-label={font === 'hand' ? 'Klare Schrift verwenden' : 'Handschrift verwenden'}
            title={font === 'hand' ? 'Schrift: Handschrift (klicken für klare Schrift)' : 'Schrift: klar (klicken für Handschrift)'}
            onClick={toggleFont}
          >
            <span aria-hidden="true" style={{ fontFamily: font === 'hand' ? '"Patrick Hand", sans-serif' : 'inherit' }}>Aa</span>
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="theme-toggle"
            aria-label={doc.theme === 'dark' ? 'Helles Thema' : 'Dunkles Thema'}
            title={doc.theme === 'dark' ? 'Helles Thema' : 'Dunkles Thema'}
            onClick={toggleTheme}
          >
            <span aria-hidden="true">{doc.theme === 'dark' ? '☀' : '☾'}</span>
          </button>
          <div className="menu">
            <button type="button" data-testid="file-menu" aria-expanded={fileOpen} onClick={() => { setFileOpen((open) => !open); setMoreOpen(false); refreshRecent(); }}>
              Datei
            </button>
            {fileOpen ? (
              <div className="menu-pop" role="menu">
                <button type="button" onClick={() => void newDocument()}>Neu</button>
                <button type="button" onClick={() => void openDocument()}>Öffnen</button>
                <button type="button" onClick={() => void save(false)}>Speichern</button>
                <button type="button" onClick={() => void save(true)}>Speichern unter</button>
                <button type="button" data-testid="export-png" onClick={() => void exportImage('png')}>Als Bild exportieren (PNG)</button>
                <button type="button" data-testid="export-pdf" onClick={() => void exportImage('pdf')}>Als PDF exportieren</button>
                <button type="button" data-testid="open-trash" onClick={openTrash}>Papierkorb…</button>
                {recent.length > 0 ? <p className="menu-kicker">Zuletzt geöffnet</p> : null}
                {recent.map((entry) => (
                  <button key={entry.path} type="button" className="recent-entry" data-testid="recent-entry" disabled={!entry.exists} title={entry.path} onClick={() => void openRecentBoard(entry)}>
                    {entry.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <span className="save-state" data-testid="save-state">{saveStateLabel(dirty, fileName, autosavedAt)}</span>
        </div>
      </header>
      {banner ? (
        <div className="banner" role="alert">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)}>Schließen</button>
        </div>
      ) : null}
      {recovery ? (
        <div className="banner" role="status" data-testid="recovery-banner">
          <span>Es gibt eine automatisch gesicherte Sitzung. Die ursprüngliche Datei wurde nicht überschrieben.</span>
          <button type="button" data-testid="recovery-restore" onClick={() => { loadJson(recovery, null, true); setRecovery(null); }}>Wiederherstellen</button>
          <button type="button" onClick={() => setRecovery(null)}>Verwerfen</button>
        </div>
      ) : null}
      <input
        ref={attachInput}
        type="file"
        multiple
        hidden
        data-testid="attach-input"
        accept={Object.keys(ATTACHMENT_TYPES).map((ext) => `.${ext}`).join(',')}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          setMoreOpen(false);
          if (files.length === 0) return;
          const center = placementRef.current?.center() ?? { x: 180, y: 140 };
          void addImageFiles(files, freeSpot({ x: center.x - 130, y: center.y - 46 }, { width: 260, height: 92 }, current.cards));
        }}
      />
      <div className="workspace">
        <aside className="toolbar" aria-label="Werkzeuge">
          <ToolButton id="tool-select" label="Auswahl" short="Auswahl" shortcut="V" pressed={tool === 'select'} onClick={() => chooseTool('select')}>
            <IconSelect />
          </ToolButton>
          <ToolButton id="tool-note" label="Notiz" short="Notiz" shortcut="N" pressed={tool === 'note'} onClick={() => chooseTool('note')}>
            <IconNote />
          </ToolButton>
          <ToolButton id="tool-heading" label="Große Überschrift" short="Titel" shortcut="T" pressed={tool === 'heading'} onClick={() => chooseTool('heading')}>
            <IconHeading />
          </ToolButton>
          <ToolButton id="tool-subheading" label="Kleine Überschrift" short="Untertitel" shortcut="U" pressed={tool === 'subheading'} onClick={() => chooseTool('subheading')}>
            <IconSubheading />
          </ToolButton>
          <ToolButton id="tool-image" label="Bild" short="Bild" shortcut="I" pressed={tool === 'image'} onClick={() => void addImage()}>
            <IconImage />
          </ToolButton>
          <ToolButton id="tool-link" label="Link" short="Link" shortcut="K" pressed={tool === 'link'} onClick={() => chooseTool('link')}>
            <IconLink />
          </ToolButton>
          <ToolButton id="tool-board" label="Unterboard" short="Board" shortcut="B" pressed={tool === 'subboard'} onClick={() => chooseTool('subboard')}>
            <IconBoard />
          </ToolButton>
          <ToolButton id="tool-column" label="Spalte" short="Spalte" shortcut="S" pressed={tool === 'column'} onClick={() => chooseTool('column')}>
            <IconColumn />
          </ToolButton>
          <ToolButton id="tool-todo" label="Aufgaben" short="Liste" shortcut="A" pressed={tool === 'todo'} onClick={() => chooseTool('todo')}>
            <IconTodo />
          </ToolButton>
          <ToolButton id="tool-draw" label="Zeichnen" short="Zeichnen" shortcut="P" pressed={tool === 'draw'} onClick={() => chooseTool('draw')}>
            <IconPen />
          </ToolButton>
          <ToolButton id="tool-line" label="Linie" short="Linie" shortcut="L" pressed={tool === 'line'} onClick={() => chooseTool('line')}>
            <IconArrow />
          </ToolButton>
          <ToolButton
            id="tool-more"
            label="Sticker und mehr"
            short="Mehr"
            pressed={moreOpen || tool === 'subboard'}
            onClick={(event) => {
              // The menu is fixed to the window so the scrolling toolbar cannot clip it.
              const rect = event.currentTarget.getBoundingClientRect();
              const top = Math.max(8, rect.top);
              setMorePos({ left: rect.right + 8, top });
              setMoreOpen((open) => !open);
            }}
          >
            <IconMore />
          </ToolButton>
          {moreOpen ? (
            <div className="more-pop" role="menu" data-testid="more-menu" ref={moreRef} style={morePos ?? undefined}>
              <button type="button" data-testid="more-board" onClick={() => { chooseTool('subboard'); }}>Unterboard</button>
              <div className="template-row">
                <p>Formen und Farbe</p>
                <div className="shape-row">
                  {([
                    ['rect', '▭', 'Rechteck'],
                    ['ellipse', '◯', 'Kreis'],
                    ['diamond', '◇', 'Raute'],
                  ] as const).map(([shape, glyph, name]) => (
                    <button
                      key={shape}
                      type="button"
                      draggable
                      data-testid={`shape-${shape}`}
                      aria-label={name}
                      title={name}
                      onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', `shape:${shape}`)}
                      onClick={() => addFromMore(shape)}
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
                <button type="button" data-testid="more-attach" onClick={() => attachInput.current?.click()}>
                  Datei anhängen
                </button>
                <button
                  type="button"
                  draggable
                  data-testid="more-table"
                  onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', 'table')}
                  onClick={() => addFromMore('table')}
                >
                  Tabelle
                </button>
                <button
                  type="button"
                  draggable
                  data-testid="more-comment"
                  onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', 'comment')}
                  onClick={() => {
                    setMoreOpen(false);
                    const center = placementRef.current?.center() ?? { x: 180, y: 140 };
                    createAt('comment', freeSpot({ x: center.x - 110, y: center.y - 32 }, { width: 220, height: 64 }, current.cards));
                  }}
                >
                  Kommentar
                </button>
                <button
                  type="button"
                  draggable
                  data-testid="more-swatch"
                  onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', 'swatch')}
                  onClick={() => addFromMore('swatch')}
                >
                  Farbfeld
                </button>
              </div>
              <div className="template-row">
                <p>Vorlage einfügen</p>
                {TEMPLATES.map((template) => (
                  <button key={template.name} type="button" data-testid={`template-${template.name}`} onClick={() => addTemplate(template.name)}>
                    {template.label}
                  </button>
                ))}
              </div>
              <div className="sticker-row">
                {(['star', 'heart', 'thumbs', 'smiley', 'arrow'] as StickerKind[]).map((kind) => (
                  <button key={kind} type="button" draggable data-testid={`sticker-${kind}`} aria-label={kind} onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', `sticker:${kind}`)} onClick={() => addStickerAt(kind)}>
                    {kind === 'star' ? '★' : kind === 'heart' ? '♥' : kind === 'thumbs' ? '👍' : kind === 'smiley' ? '☺' : '➜'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
        <main className="stage">
          <BoardCanvas
            key={current.id}
            board={current}
            syncToken={syncToken}
            selectRequest={selectRequest}
            editingId={editingId}
            focusId={focusId}
            connect={false}
            tool={tool}
            lookup={lookup}
            placementRef={placementRef}
            onCreate={createAt}
            onPositions={(updates) => {
              const result = moveCards(histRef.current.present, current.id, updates);
              if (result.ok) live(result.doc);
            }}
            onSizes={(updates) => {
              let present = histRef.current.present;
              const rest: { id: string; width: number; height: number }[] = [];
              for (const update of updates) {
                const card = getBoard(present, current.id)?.cards.find((item) => item.id === update.id);
                if (card?.type === 'column') {
                  const laid = setColumnWidth(present, current.id, update.id, update.width);
                  if (laid.ok) present = laid.doc;
                } else rest.push(update);
              }
              const result = rest.length > 0 ? resizeCards(present, current.id, rest) : { ok: true as const, doc: present };
              if (result.ok) live(withColumnsRelaid(result.doc, current.id, rest.map((update) => update.id)));
            }}
            onDragStart={() => {
              dragBefore.current = histRef.current.present;
            }}
            onDragStop={(id, pointer) => {
              const before = dragBefore.current;
              dragBefore.current = null;
              queueMicrotask(() => {
                if (!before) return;
                let present = histRef.current.present;
                const card = getBoard(present, boardRef.current)?.cards.find((item) => item.id === id);
                if (card?.type === 'column') {
                  const board = getBoard(present, boardRef.current);
                  if (board) {
                    const laid = relayoutColumn(board, id);
                    present = { ...present, boards: present.boards.map((item) => (item.id === board.id ? laid : item)) };
                  }
                } else {
                  const settled = settleCardDrop(present, boardRef.current, id, pointer);
                  if (settled.ok) present = settled.doc;
                  // Several selected cards dragged together all follow the dragged one into (or out of) a column.
                  const moved = getBoard(present, boardRef.current);
                  const lead = moved?.cards.find((item) => item.id === id);
                  const others = selectedIds.filter((other) => other !== id);
                  if (moved && lead && lead.type !== 'column' && others.length > 0) {
                    const followers = moved.cards
                      .filter((item) => others.includes(item.id) && item.type !== 'column')
                      .sort((a, b) => a.y - b.y);
                    for (const follower of followers) {
                      const columnCard = lead.columnId ? getBoard(present, boardRef.current)?.cards.find((c) => c.id === lead.columnId) : undefined;
                      // Into the lead's column (appended at the bottom, in their top-to-bottom order) or wherever they now lie.
                      const point = columnCard
                        ? { x: columnCard.x + columnCard.width / 2, y: columnCard.y + columnCard.height - 1 }
                        : { x: follower.x + follower.width / 2, y: follower.y + follower.height / 2 };
                      const placed = settleCardDrop(present, boardRef.current, follower.id, point);
                      if (placed.ok) present = placed.doc;
                    }
                  }
                }
                histRef.current = endGesture(replacePresent(histRef.current, present), before, present, sameContent);
                setHist(histRef.current);
                setSyncToken((value) => value + 1);
              });
            }}
            onDelete={(ids) => deleteWithConfirm(ids)}
            onDropFiles={(files, point) => void addImageFiles(files, point)}
            onPointer={(point) => {
              pointerRef.current = point;
            }}
            onOpenCard={openCard}
            onContextMenu={(target, screen, point) => {
              let ids: string[] = [];
              if (target.kind === 'card') {
                ids = selectedIds.includes(target.id) ? cardsOnBoard(selectedIds) : [target.id];
                if (!selectedIds.includes(target.id)) selectCards([target.id]);
              }
              setSelectedLine(null);
              setContextMenu({ target, ids, screen, point });
            }}
            onConnect={(connection) => {
              if (!connection.source || !connection.target) return;
              const result = addConnector(histRef.current.present, current.id, connection);
              if (!result.ok) {
                setBanner(result.error);
                return;
              }
              commit(result.doc);
            }}
            onDeleteEdges={(ids) => {
              const result = deleteConnectors(histRef.current.present, current.id, ids);
              if (result.ok) commit(result.doc);
            }}
            onViewport={(viewport) => {
              const result = updateViewport(histRef.current.present, current.id, viewport);
              if (result.ok) live(result.doc);
            }}
            onEdit={beginEdit}
            onSelection={setSelectedIds}
            onDropTool={onDropTool}
            onLinePoint={placeLine}
            onSelectLine={setSelectedLine}
            onDrawLine={drawLine}
            onLineEndpoint={moveLineEnd}
            onLineBend={(lineId, bend) => {
              const result = updateLine(histRef.current.present, current.id, lineId, { bend });
              if (result.ok && !sameContent(result.doc, histRef.current.present)) commit(result.doc);
            }}
            centerRequest={centerRequest}
            showMiniMap={showMiniMap}
            onToggleMiniMap={() => setShowMiniMap((value) => !value)}
            onLayoutSync={() => setSyncToken((value) => value + 1)}
            lines={current.lines.flatMap((line) => {
              const start = anchorPosition(line.source, current.cards);
              const end = anchorPosition(line.target, current.cards);
              if (!start || !end) return [];
              return [{
                id: line.id,
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                color: line.color === 'ink' ? 'currentColor' : colorFill(line.color),
                colorName: line.color,
                arrowhead: line.arrowhead,
                selected: line.id === selectedLine,
                sourceKind: line.source.kind,
                targetKind: line.target.kind,
                bend: line.bend ?? 0,
              }];
            })}
          />
          {selectedLine ? (
            <div className="color-bar" role="toolbar" aria-label="Linie">
              {(['ink', ...NOTE_COLOR_ORDER] as const).map((color) => (
                <button
                  key={color}
                  type="button"
                  data-testid={`line-color-${color}`}
                  aria-label={color === 'ink' ? 'Schwarz' : COLOR_NAMES[color]}
                  className="swatch"
                  style={{ background: color === 'ink' ? '#241c14' : colorFill(color) }}
                  onClick={() => {
                    const result = updateLine(histRef.current.present, current.id, selectedLine, { color });
                    if (result.ok) commit(result.doc);
                  }}
                />
              ))}
              <button type="button" data-testid="line-arrow" onClick={() => {
                const line = current.lines.find((item) => item.id === selectedLine);
                if (!line) return;
                const result = updateLine(histRef.current.present, current.id, selectedLine, { arrowhead: !line.arrowhead });
                if (result.ok) commit(result.doc);
              }}>Pfeil</button>
              <button type="button" data-testid="line-delete" onClick={() => {
                const result = deleteLines(histRef.current.present, current.id, [selectedLine]);
                if (result.ok) {
                  commit(result.doc);
                  setSelectedLine(null);
                }
              }}>Löschen</button>
            </div>
          ) : null}
          {selectedNote && !selectedLine ? (
            <div className="color-bar" role="toolbar" aria-label="Notizfarbe">
              {NOTE_COLOR_ORDER.map((color) => (
                <button
                  key={color}
                  type="button"
                  data-testid={`color-${color}`}
                  aria-label={COLOR_NAMES[color]}
                  className="swatch"
                  style={{ background: colorFill(color) }}
                  onClick={() => {
                    setNoteColor(color);
                    const result = setNoteColors(histRef.current.present, current.id, selectedIds, color);
                    if (result.ok) commit(result.doc);
                  }}
                />
              ))}
            </div>
          ) : null}
          {current.cards.length === 0 && !linkPrompt ? (
            <div className="empty-hint" data-testid="empty-hint">
              <p className="empty-title">Dieses Board ist noch leer</p>
              <p>Doppelklick auf die Fläche legt eine Notiz an.</p>
              <p>Werkzeuge links anklicken oder auf die Fläche ziehen.</p>
              <p>Bilder aus dem Explorer hineinziehen oder mit Strg+V einfügen.</p>
              {current.id === doc.rootBoardId && recent.some((entry) => entry.exists) ? (
                <div className="recent-start" data-testid="recent-start">
                  <p className="empty-subtitle">Zuletzt geöffnet</p>
                  {recent.filter((entry) => entry.exists).slice(0, 5).map((entry) => (
                    <button key={entry.path} type="button" data-testid="recent-start-entry" title={entry.path} onClick={() => void openRecentBoard(entry)}>
                      <strong>{entry.name}</strong>
                      <span>{entry.folder}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {trash ? (
            <div className="search-panel trash-panel" role="dialog" aria-label="Papierkorb" data-testid="trash-panel">
              <div className="trash-head">
                <strong>Papierkorb</strong>
                <button type="button" onClick={() => setTrash(null)} aria-label="Papierkorb schließen">✕</button>
              </div>
              <p className="search-meta">Gelöschte Karten bleiben 30 Tage hier, auch nach dem Schließen.</p>
              {trash.length === 0 ? <p className="search-empty">Der Papierkorb ist leer.</p> : null}
              <ul className="search-results">
                {trash.map((entry) => (
                  <li key={entry.id} className="trash-entry" data-testid="trash-entry">
                    <span>
                      <span>{entry.title || 'Ohne Titel'}</span>
                      <span className="search-meta">
                        {entry.count === 1 ? '1 Karte' : `${entry.count} Karten`} · {new Date(entry.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </span>
                    <span className="trash-actions">
                      <button type="button" data-testid="trash-restore" onClick={() => void restoreFromTrash(entry)}>Wiederherstellen</button>
                      <button type="button" aria-label="Endgültig löschen" title="Endgültig löschen" onClick={() => void api.trashDelete(entry.id).then(openTrash)}>✕</button>
                    </span>
                  </li>
                ))}
              </ul>
              {trash.length > 0 ? (
                <button type="button" className="trash-empty" data-testid="trash-empty" onClick={() => void api.trashDelete('all').then(openTrash)}>
                  Papierkorb leeren
                </button>
              ) : null}
            </div>
          ) : null}
          {searchOpen ? (
            <SearchPanel
              doc={doc}
              query={searchQuery}
              onQuery={setSearchQuery}
              onPick={(hit) => jumpTo(hit)}
              onClose={() => setSearchOpen(false)}
            />
          ) : null}
          {toast ? (
            <div className="toast" role="status" data-testid="toast" key={toast.id}>
              <span>{toast.text}</span>
              {toast.undo ? (
                <button type="button" data-testid="toast-undo" onClick={() => { undo(); setToast(null); }}>
                  Rückgängig
                </button>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>
      {paletteOpen ? <CommandPalette commands={commands()} onClose={() => setPaletteOpen(false)} /> : null}
      {introStep !== null ? <Intro step={introStep} onStep={setIntroStep} onDone={finishIntro} /> : null}
      {linkPrompt ? (
        <form
          className="link-prompt"
          data-testid="link-prompt"
          style={{ left: linkPrompt.screen.x, top: linkPrompt.screen.y }}
          onSubmit={(event) => {
            event.preventDefault();
            submitLinkPrompt();
          }}
        >
          <label htmlFor="link-input">{linkPrompt.editId ? 'Link ändern' : 'Web-Adresse für den Link'}</label>
          <input
            id="link-input"
            data-testid="link-input"
            autoFocus
            placeholder="https://…"
            value={linkPrompt.value}
            onChange={(event) => setLinkPrompt({ ...linkPrompt, value: event.target.value, error: null })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setLinkPrompt(null);
              }
            }}
          />
          {linkPrompt.error ? <p className="link-error" role="alert">{linkPrompt.error}</p> : null}
          <div className="link-actions">
            <button type="button" onClick={() => setLinkPrompt(null)}>Abbrechen</button>
            <button type="submit" data-testid="link-submit">{linkPrompt.editId ? 'Übernehmen' : 'Einfügen'}</button>
          </div>
        </form>
      ) : null}
      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          board={current}
          hasClip={Boolean(clipRef.current)}
          onClose={() => setContextMenu(null)}
          onAction={(action, color) => {
            const ids = contextMenu.ids;
            setContextMenu(null);
            const card = ids.length === 1 ? current.cards.find((item) => item.id === ids[0]) : undefined;
            if (action === 'edit' && card) {
              if (card.type === 'link') openLinkPrompt({ x: card.x, y: card.y }, card.id, card.url);
              else beginEdit(card.id);
            } else if (action === 'open' && card) {
              if (card.type === 'link') lookup.openLink(card.url);
              else openCard(card.id);
            } else if (action === 'color' && color) {
              setNoteColor(color);
              const result = setNoteColors(histRef.current.present, current.id, ids, color);
              if (result.ok) commit(result.doc);
            } else if (action === 'duplicate') {
              duplicateSelection();
            } else if (action === 'copy') {
              copySelection(null);
              showToast(ids.length === 1 ? 'Karte kopiert' : `${ids.length} Karten kopiert`);
            } else if (action === 'cut') {
              copySelection(null);
              void deleteWithConfirm(ids);
            } else if (action === 'front' || action === 'back') {
              const result = reorderCards(histRef.current.present, current.id, ids, action);
              if (result.ok) commit(result.doc);
            } else if (action === 'delete') {
              void deleteWithConfirm(ids);
            } else if (action === 'paste' && clipRef.current) {
              pasteClipAt(clipRef.current.clip, contextMenu.point);
            } else if (action === 'note') {
              createAt('note', contextMenu.point);
            } else if (action === 'link') {
              openLinkPrompt(contextMenu.point, null, '');
            } else if (action === 'selectAll') {
              selectCards('all');
            }
          }}
        />
      ) : null}
    </div>
  );
}

function SearchPanel({
  doc,
  query,
  onQuery,
  onPick,
  onClose,
}: {
  doc: WhiteboardDocument;
  query: string;
  onQuery: (value: string) => void;
  onPick: (hit: SearchHit) => void;
  onClose: () => void;
}) {
  const hits = useMemo(() => searchDocument(doc, query), [doc, query]);
  return (
    <div className="search-panel" role="search" data-testid="search-panel">
      <input
        autoFocus
        data-testid="search-input"
        aria-label="In allen Boards suchen"
        placeholder="In allen Boards suchen …"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'Enter' && hits[0]) {
            event.preventDefault();
            onPick(hits[0]);
          }
        }}
      />
      {query.trim() && hits.length === 0 ? <p className="search-empty">Nichts gefunden.</p> : null}
      <ul className="search-results">
        {hits.map((hit, index) => (
          <li key={`${hit.boardId}-${hit.cardId ?? 'board'}-${index}`}>
            <button type="button" data-testid="search-hit" onClick={() => onPick(hit)}>
              <span>{hit.text || '(ohne Text)'}</span>
              <span className="search-meta">{hit.kind} · {hit.boardTitle}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Command = { id: string; group: string; label: string; shortcut?: string; keywords?: string; run: () => void };

function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const fold = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  const shown = commands.filter((command) => words.every((word) => fold(`${command.group} ${command.label} ${command.shortcut ?? ''} ${command.keywords ?? ''}`).includes(word)));
  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    // Run after the palette is gone, so focus and menus behave as if the command was clicked directly.
    window.setTimeout(command.run, 0);
  };
  return (
    <div className="palette-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Befehle und Tastenkürzel" data-testid="palette">
        <input
          autoFocus
          data-testid="palette-input"
          aria-label="Befehl suchen"
          placeholder="Befehl suchen … (z. B. „pdf“, „spalte“, „dunkel“)"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((value) => Math.min(shown.length - 1, value + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              run(shown[active]);
            }
          }}
        />
        <ul className="palette-list" role="listbox">
          {shown.length === 0 ? <li className="search-empty">Kein Befehl gefunden.</li> : null}
          {shown.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === active}>
              <button type="button" data-testid="palette-item" className={index === active ? 'is-active' : undefined} onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
                <span className="palette-group">{command.group}</span>
                <span className="palette-label">{command.label}</span>
                {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const INTRO_STEPS = [
  { title: 'Willkommen bei FocusBoard', text: 'Eine freie Fläche für Notizen, Bilder, Listen, Links, Skizzen und Unterboards. Alles bleibt auf deinem Rechner.' },
  { title: 'Karten anlegen', text: 'Doppelklick auf die Fläche legt eine Notiz an. Werkzeuge links anklicken oder auf die Fläche ziehen. Bilder und Dateien einfach hineinziehen oder mit Strg+V einfügen.' },
  { title: 'Schneller arbeiten', text: 'Strg+K zeigt alle Befehle und Tastenkürzel. Strg+F sucht in allen Boards. Rechtsklick auf eine Karte zeigt, was mit ihr möglich ist. Sobald du einmal gespeichert hast, speichert FocusBoard automatisch.' },
];

function Intro({ step, onStep, onDone }: { step: number; onStep: (step: number) => void; onDone: () => void }) {
  const current = INTRO_STEPS[step] ?? INTRO_STEPS[0]!;
  const last = step >= INTRO_STEPS.length - 1;
  return (
    <div className="palette-backdrop">
      <div className="intro" role="dialog" aria-label="Einführung" data-testid="intro">
        <p className="intro-step">Schritt {step + 1} von {INTRO_STEPS.length}</p>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="intro-actions">
          <button type="button" data-testid="intro-skip" onClick={onDone}>Überspringen</button>
          {step > 0 ? <button type="button" onClick={() => onStep(step - 1)}>Zurück</button> : null}
          <button type="button" className="intro-next" data-testid="intro-next" autoFocus onClick={() => (last ? onDone() : onStep(step + 1))}>
            {last ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}

type MenuAction = 'edit' | 'open' | 'color' | 'duplicate' | 'copy' | 'cut' | 'front' | 'back' | 'delete' | 'paste' | 'note' | 'link' | 'selectAll';

function ContextMenu({
  state,
  board,
  hasClip,
  onClose,
  onAction,
}: {
  state: ContextMenuState;
  board: { cards: { id: string; type: string; style?: string }[] };
  hasClip: boolean;
  onClose: () => void;
  onAction: (action: MenuAction, color?: NoteColor) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('blur', onClose);
    ref.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);
  const cards = board.cards.filter((card) => state.ids.includes(card.id));
  const single = cards.length === 1 ? cards[0] : undefined;
  const notes = cards.some((card) => (card.type === 'text' && card.style === 'note') || card.type === 'shape');
  const left = Math.min(state.screen.x, window.innerWidth - 230);
  const top = Math.min(state.screen.y, window.innerHeight - (state.target.kind === 'card' ? 380 : 190));
  const item = (action: MenuAction, label: string, hint?: string) => (
    <button type="button" role="menuitem" data-testid={`menu-${action}`} onClick={() => onAction(action)}>
      <span>{label}</span>
      {hint ? <kbd>{hint}</kbd> : null}
    </button>
  );
  return (
    <div className="context-menu" role="menu" data-testid="context-menu" ref={ref} style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
      {state.target.kind === 'card' ? (
        <>
          {single && ['text', 'board', 'link', 'shape', 'swatch', 'sketch'].includes(single.type) ? item('edit', single.type === 'board' ? 'Umbenennen' : 'Bearbeiten', 'F2') : null}
          {single?.type === 'board' ? item('open', 'Öffnen') : null}
          {single?.type === 'link' ? item('open', 'Im Browser öffnen') : null}
          {notes ? (
            <div className="menu-colors" role="group" aria-label="Notizfarbe">
              {NOTE_COLOR_ORDER.map((color) => (
                <button key={color} type="button" className="swatch" aria-label={COLOR_NAMES[color]} data-testid={`menu-color-${color}`} style={{ background: colorFill(color) }} onClick={() => onAction('color', color)} />
              ))}
            </div>
          ) : null}
          {item('duplicate', 'Duplizieren', 'Strg+D')}
          {item('copy', 'Kopieren', 'Strg+C')}
          {item('cut', 'Ausschneiden', 'Strg+X')}
          <hr />
          {item('front', 'Nach vorne')}
          {item('back', 'Nach hinten')}
          <hr />
          {item('delete', 'Löschen', 'Entf')}
        </>
      ) : (
        <>
          {hasClip ? item('paste', 'Hier einfügen', 'Strg+V') : null}
          {item('note', 'Notiz hier anlegen')}
          {item('link', 'Link hier anlegen')}
          {item('selectAll', 'Alles auswählen', 'Strg+A')}
        </>
      )}
    </div>
  );
}

const COLOR_NAMES: Record<NoteColor, string> = NOTE_COLOR_NAMES;

function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(undefined);
    image.src = dataUrl;
  });
}

/** Per-viewer preferences; storage can be unavailable, so every access is guarded. */
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore: the preference simply is not remembered
  }
}

/** Short description of deleted cards for the trash list. */
function trashTitle(clip: Clip, boardTitle: (id: string) => string): string {
  for (const card of clip.cards) {
    const text =
      card.type === 'text' || card.type === 'shape' ? plain(card.text)
      : card.type === 'todo' || card.type === 'column' ? card.title
      : card.type === 'board' ? `Board „${boardTitle(card.boardId)}“`
      : card.type === 'link' ? card.title || card.url
      : card.type === 'file' ? card.name
      : card.type === 'swatch' ? card.label || card.color
      : card.type === 'image' ? 'Bild'
      : card.type === 'sketch' ? 'Skizze'
      : card.type === 'table' ? (card.rows[0] ?? []).filter(Boolean).join(' | ') || 'Tabelle'
      : 'Sticker';
    if (text.trim()) return text.trim().slice(0, 80);
  }
  return 'Karten';
}

function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function ToolButton({
  id,
  label,
  short,
  shortcut,
  pressed,
  onClick,
  children,
}: {
  id: string;
  label: string;
  short: string;
  shortcut?: string;
  pressed: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={id}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={pressed ? 'is-on' : ''}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-whiteboard-tool', id.replace('tool-', ''));
        event.dataTransfer.effectAllowed = 'copy';
        const preview = document.createElement('div');
        preview.textContent = label;
        preview.style.cssText = 'position:fixed;top:-1000px;left:0;padding:4px 8px;background:#fff;color:#241c14;border:1px solid #241c14;border-radius:12px;font:16px "Segoe UI",sans-serif;';
        document.body.appendChild(preview);
        event.dataTransfer.setDragImage(preview, 8, 8);
        window.setTimeout(() => preview.remove(), 0);
      }}
      onClick={onClick}
    >
      {children}
      <span className="tool-label" aria-hidden="true">{short}</span>
    </button>
  );
}

/** True for any field where keys belong to the text, not to board shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'range'].includes(target.type);
  return target.dataset.role === 'card-editor';
}

function saveStateLabel(dirty: boolean, fileName: string | null, autosavedAt: Date | null): string {
  if (!dirty) return fileName ? 'Alle Änderungen gespeichert' : 'Keine Änderungen';
  const target = fileName ? 'Nicht in Datei gespeichert' : 'Noch nicht als Datei gespeichert';
  if (!autosavedAt) return target;
  const time = autosavedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${target} · Sicherung ${time}`;
}

/** Re-stacks every column that holds one of the given cards, so a taller card never overlaps the next one. */
function withColumnsRelaid(doc: WhiteboardDocument, boardId: string, cardIds: string[]): WhiteboardDocument {
  const board = getBoard(doc, boardId);
  if (!board) return doc;
  const columns = new Set<string>();
  for (const card of board.cards) {
    if (cardIds.includes(card.id) && card.type !== 'column' && card.columnId) columns.add(card.columnId);
  }
  if (columns.size === 0) return doc;
  let next = board;
  for (const columnId of columns) next = relayoutColumn(next, columnId);
  return { ...doc, boards: doc.boards.map((item) => (item.id === boardId ? next : item)) };
}

function rawVersion(json: string): number | null {
  try {
    const value = JSON.parse(json) as { version?: unknown };
    return typeof value.version === 'number' ? value.version : null;
  } catch {
    return null;
  }
}

function colorFill(color: NoteColor): string {
  return NOTE_COLORS[color].fill;
}
