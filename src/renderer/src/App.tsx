import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  addColumn,
  addConnector,
  addImageCard,
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
  setTextCardHeight,
  updateText,
  updateViewport,
} from '../../shared/boardOps';
import { relayoutColumn, renameColumn, setColumnWidth, settleCardDrop, toggleColumn } from '../../shared/columns';
import { addCanvasLine, anchorPosition, deleteLines, lineIntersectsRect, reverseLine, snapAnchor, translateLines, updateLine, visibleLineEnds } from '../../shared/lines';
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
import { NOTE_COLOR_ORDER } from '../../shared/limits';
import type { LineAnchor, NoteColor, StickerKind, TextStyle, WhiteboardDocument } from '../../shared/model';
import { buildDemoDocument, drawSamplePng } from './demo';
import { BoardCanvas, type PlacementApi } from './components/BoardCanvas';
import { Home } from './Home';
import type { CardLookup } from './components/cards';
import {
  IconArrow,
  IconColumn,
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

type Tool = 'select' | 'note' | 'heading' | 'subheading' | 'image' | 'column' | 'todo' | 'line' | 'subboard';

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
  const startOnBoard = demo || (params.get('e2e') === '1' && params.get('home') !== '1');
  const queryTheme = params.get('theme') === 'dark' ? 'dark' : params.get('theme') === 'light' ? 'light' : null;
  const [hist, setHist] = useState<History<WhiteboardDocument>>(() => createHistory(createEmptyDocument()));
  const doc = hist.present;
  const [boardId, setBoardId] = useState(doc.rootBoardId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [syncToken, setSyncToken] = useState(0);
  const [view, setView] = useState<'home' | 'board'>(startOnBoard ? 'board' : 'home');
  const [libraryId, setLibraryId] = useState<string | null>(null);
  const libraryMtime = useRef<number | null>(null);
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
  const [lineCursor, setLineCursor] = useState<{ x: number; y: number } | null>(null);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [dockHover, setDockHover] = useState<string | null>(null);
  const selectedLine = selectedLines.length === 1 ? selectedLines[0] : null;
  const [headerDraft, setHeaderDraft] = useState('Hauptboard');
  const [saving, setSaving] = useState(false);
  const [recoveryStamp, setRecoveryStamp] = useState<string | null>(null);
  const [todoFocus, setTodoFocus] = useState<{ cardId: string; itemId: string } | null>(null);
  const [selectRevision, setSelectRevision] = useState(0);
  const [themePref, setThemePref] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('whiteboard-theme');
    return stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light';
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const freshNotes = useRef(new Set<string>());
  const notesWithText = useRef(new Set<string>());
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const titleCancel = useRef(false);
  const histRef = useRef(hist);
  histRef.current = hist;
  const boardRef = useRef(boardId);
  boardRef.current = boardId;
  const editingRef = useRef(editingId);
  editingRef.current = editingId;
  const dragBefore = useRef<WhiteboardDocument | null>(null);
  const editBefore = useRef<WhiteboardDocument | null>(null);
  const placementRef = useRef<PlacementApi | null>(null);
  const current = getBoard(doc, boardId) ?? getBoard(doc, doc.rootBoardId)!;
  const baseline = useRef<string | null>(null);
  if (baseline.current === null) baseline.current = contentSignature(doc);
  const dirty = contentSignature(doc) !== (savedSig ?? baseline.current);

  const appearance = queryTheme ?? (themePref === 'system' ? (systemDark ? 'dark' : 'light') : themePref);

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    if (!queryTheme) localStorage.setItem('whiteboard-theme', themePref);
  }, [appearance, queryTheme, themePref]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (tool !== 'line') setLineDraft(null);
  }, [tool]);

  useEffect(() => {
    setLineDraft(null);
    setSelectedLines([]);
  }, [boardId]);

  useEffect(() => {
    if (demo) setSelectedLines(['linkdemo1']);
  }, [demo, boardId]);

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
        setSelectedLines(['linkdemo1']);
        setSyncToken((value) => value + 1);
      }
      return;
    }
    void api.readRecovery().then((result) => {
      if (result.ok && !result.missing) setRecovery(result.json);
    });
  }, [api, demo, queryTheme]);

  useEffect(() => {
    if (demo || view !== 'board') return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      const json = serializeDocument(histRef.current.present);
      const library = libraryId;
      const finish = (ok: boolean) => {
        setSaving(false);
        if (!ok) return;
        setRecoveryStamp(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
        if (library) setSavedSig(contentSignature(histRef.current.present));
      };
      void api.writeRecovery(json).then(async (recoveryResult) => {
        if (library) {
          const saved = await api.librarySave(library, json, libraryMtime.current);
          if (saved.ok) libraryMtime.current = saved.mtime;
          else setBanner(saved.error);
          finish(recoveryResult.ok && saved.ok);
          return;
        }
        finish(recoveryResult.ok);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [api, doc, demo, view, libraryId]);

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
    const next = undoHistory(histRef.current);
    histRef.current = { ...next, present: keepViewports(next.present, histRef.current.present) };
    setHist(histRef.current);
    setEditingId(null);
    setSyncToken((value) => value + 1);
  }

  function redo() {
    if (editingRef.current) return;
    const next = redoHistory(histRef.current);
    histRef.current = { ...next, present: keepViewports(next.present, histRef.current.present) };
    setHist(histRef.current);
    setSyncToken((value) => value + 1);
  }

  function beginEdit(id: string) {
    if (!editBefore.current) editBefore.current = structuredClone(histRef.current.present);
    setEditingId(id);
    setTool('select');
    setSyncToken((value) => value + 1);
  }

  function finishEdit() {
    const before = editBefore.current;
    const edited = editingRef.current;
    editBefore.current = null;
    setEditingId(null);
    editingRef.current = null;
    if (edited && freshNotes.current.has(edited) && !notesWithText.current.has(edited)) {
      const card = getBoard(histRef.current.present, boardRef.current)?.cards.find((item) => item.id === edited);
      if (before && (!card || (card.type === 'text' && card.text.trim() === ''))) {
        freshNotes.current.delete(edited);
        histRef.current = replacePresent(histRef.current, before);
        setHist(histRef.current);
        setSyncToken((value) => value + 1);
        return;
      }
    }
    if (before) {
      histRef.current = endGesture(histRef.current, before, histRef.current.present, sameContent);
      setHist(histRef.current);
    }
    setSyncToken((value) => value + 1);
  }

  function createAt(kind: 'note' | 'heading' | 'subheading' | 'subboard' | 'column' | 'todo' | 'line', point: { x: number; y: number }) {
    if (kind === 'line') {
      placeLine(point);
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
    const style: TextStyle = kind === 'heading' || kind === 'subheading' ? kind : 'note';
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
    if (!editBefore.current) editBefore.current = structuredClone(histRef.current.present);
    live(next);
    if (created) {
      freshNotes.current.add(created.id);
      setFocusId(created.id);
      setEditingId(created.id);
      editingRef.current = created.id;
      setTool('select');
      setSyncToken((value) => value + 1);
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
    const center = point ?? placementRef.current?.center() ?? { x: 180, y: 140 };
    const position = point ?? placementTopLeft(center, { width: 280, height: 210 }, 0);
    const result = addImageCard(histRef.current.present, boardRef.current, picked, position);
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

  function onDropTool(name: string, point: { x: number; y: number }) {
    if (name === 'image') {
      void addImage(point);
      return;
    }
    if (name.startsWith('sticker:')) {
      const kind = name.slice('sticker:'.length) as StickerKind;
      addStickerAt(kind, point);
      return;
    }
    if (name === 'note' || name === 'heading' || name === 'subheading' || name === 'column' || name === 'todo' || name === 'line') {
      createAt(name, point);
    }
  }

  function addStickerAt(kind: StickerKind, point?: { x: number; y: number }) {
    const center = point ?? placementRef.current?.center() ?? { x: 180, y: 140 };
    const position = point ?? placementTopLeft(center, { width: 104, height: 104 }, getBoard(histRef.current.present, boardRef.current)?.cards.length ?? 0);
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
    setRecoveryStamp(null);
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
    setSelectedLines([]);
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
    if (view === 'home') {
      const imported = await api.libraryImport(opened.json);
      await api.rejectOpened();
      if (!imported.ok) {
        setBanner(imported.error);
        return;
      }
      await openLibrary(imported.id);
      setFileOpen(false);
      return;
    }
    const accepted = loadJson(opened.json, opened.fileName, false);
    if (accepted) await api.confirmOpened();
    await api.clearRecovery();
    setFileOpen(false);
  }

  function loadJson(json: string, name: string | null, keepDirty: boolean): boolean {
    let theme = histRef.current.present.theme;
    try {
      const raw = JSON.parse(json) as { version?: number };
      if (raw.version === 1) theme = histRef.current.present.theme;
    } catch {
      theme = histRef.current.present.theme;
    }
    const validated = validateDocument(json);
    if (!validated.ok) {
      setBanner(validated.error);
      void api.rejectOpened();
      return false;
    }
    const next = rawVersion(json) === 1 ? { ...validated.doc, theme } : validated.doc;
    setHist(createHistory(next));
    setBoardId(next.rootBoardId);
    setFileName(name);
    setSavedSig(keepDirty ? null : contentSignature(next));
    setEditingId(null);
    setFocusId(null);
    setSelectedLines([]);
    setLineDraft(null);
    setSyncToken((value) => value + 1);
    return true;
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
        if (text.trim()) notesWithText.current.add(id);
        const result = updateText(histRef.current.present, boardRef.current, id, text);
        if (result.ok) live(result.doc);
      },
      setTextHeight: (id, height) => {
        const result = setTextCardHeight(histRef.current.present, boardRef.current, id, height);
        if (result.ok) live(result.doc);
      },
      pendingTodoFocus: (cardId) => (todoFocus?.cardId === cardId ? todoFocus.itemId : null),
      commitTitle: (id, title) => {
        const result = renameBoard(histRef.current.present, id, title);
        if (result.ok) live(result.doc);
      },
      openBoard: (id) => {
        finishEdit();
        setSelectedLines([]);
        setLineDraft(null);
        setBoardId(id);
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
        const result = addTodoItem(histRef.current.present, boardRef.current, cardId, itemId);
        if (result.ok) {
          commit(result.doc);
          if (result.itemId) setTodoFocus({ cardId, itemId: result.itemId });
        }
      },
      deleteTodoItem: (cardId, itemId) => {
        const result = deleteTodoItem(histRef.current.present, boardRef.current, cardId, itemId);
        if (result.ok) {
          commit(result.doc);
          if (result.focusId) setTodoFocus({ cardId, itemId: result.focusId });
        }
      },
      startEdit: (id) => beginEdit(id),
      armGesture: () => {
        if (!editBefore.current) editBefore.current = structuredClone(histRef.current.present);
      },
      zoom: () => getBoard(histRef.current.present, boardRef.current)?.viewport.zoom ?? 1,
      resizeColumnTo: (id, width) => {
        const result = setColumnWidth(histRef.current.present, boardRef.current, id, width);
        if (result.ok) live(result.doc);
      },
    };
  }, [doc, boardId, editingId, todoFocus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = isTypingTarget(target);
      if (event.key === 'Escape') {
        if (typing) return;
        setEditingId(null);
        editBefore.current = null;
        setTool('select');
        setLineDraft(null);
        setSelectedLines([]);
        setMoreOpen(false);
        setFileOpen(false);
        return;
      }
      if (typing) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedIds(current.cards.map((card) => card.id));
        setSelectRevision((value) => value + 1);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLines.length > 0) {
        event.preventDefault();
        const result = deleteLines(histRef.current.present, current.id, selectedLines);
        if (result.ok) {
          commit(result.doc);
          setSelectedLines([]);
        }
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
        if (card && (card.type === 'text' || card.type === 'board')) beginEdit(card.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const offs = [
      api.onMenuNew(() => void newDocument()),
      api.onMenuOpen(() => void openDocument()),
      api.onMenuSave(() => void save(false)),
      api.onMenuSaveAs(() => void save(true)),
      api.onSaveAndClose(() => void save(false).then((ok) => { if (ok) api.approveClose(); })),
    ];
    return () => offs.forEach((off) => off());
  });

  useEffect(() => {
    if (params.get('e2e') !== '1') return;
    void api.loadFixture().then((result) => {
      if (result.ok && !result.missing) loadJson(result.json, 'fixture.json', false);
    });
  }, [api]);

  async function openLibrary(id: string) {
    const opened = await api.libraryOpen(id);
    if (!opened.ok) {
      setBanner(opened.error);
      return;
    }
    const accepted = loadJson(opened.json, opened.fileName, false);
    if (!accepted) return;
    await api.libraryConfirm(id);
    libraryMtime.current = opened.mtime;
    setLibraryId(id);
    setView('board');
  }

  async function goHome() {
    if (libraryId) {
      const saved = await api.librarySave(libraryId, serializeDocument(histRef.current.present), libraryMtime.current);
      if (saved.ok) libraryMtime.current = saved.mtime;
    }
    setView('home');
  }

  const crumbs = breadcrumb(doc, current.id);
  const selectedNote = current.cards.some((card) => selectedIds.includes(card.id) && card.type === 'text' && card.style === 'note');

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          data-testid="brand-home"
          aria-label="FocusBoard, zur Übersicht"
          onClick={() => void goHome()}
        >
          <img src={markUrl} alt="" />
          <span>FocusBoard</span>
        </button>
        {view === 'board' ? (
          <button type="button" data-testid="library-home" onClick={() => void goHome()}>Zur Übersicht</button>
        ) : null}
        {view === 'board' ? <nav className="crumbs" aria-label="Board-Pfad">
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
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      titleCancel.current = true;
                      setHeaderDraft(current.title);
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    if (titleCancel.current) {
                      titleCancel.current = false;
                      setHeaderDraft(current.title);
                      return;
                    }
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
        </nav> : null}
        <div className="top-actions">
          {view === 'board' ? (
            <>
              <button type="button" data-testid="undo" data-past={hist.past.length} aria-label="Rückgängig" disabled={hist.past.length === 0 || editingId !== null} onClick={undo}>
                <IconUndo />
              </button>
              <button type="button" data-testid="redo" aria-label="Wiederholen" disabled={hist.future.length === 0 || editingId !== null} onClick={redo}>
                <IconRedo />
              </button>
            </>
          ) : null}
          <button
            type="button"
            data-testid="theme-toggle"
            aria-label={`Farbschema: ${themePref === 'system' ? 'Wie System' : themePref === 'dark' ? 'Dunkel' : 'Hell'}`}
            onClick={() => setThemePref((currentPref) => (currentPref === 'light' ? 'dark' : currentPref === 'dark' ? 'system' : 'light'))}
          >
            {themePref === 'system' ? 'System' : themePref === 'dark' ? 'Dunkel' : 'Hell'}
          </button>
          <div className="menu">
            <button type="button" data-testid="file-menu" aria-expanded={fileOpen} onClick={() => { setFileOpen((open) => !open); setMoreOpen(false); }}>
              Datei
            </button>
            {fileOpen ? (
              <div className="menu-pop" role="menu">
                <button type="button" onClick={() => void newDocument()}>Neu</button>
                <button type="button" onClick={() => void openDocument()}>Öffnen</button>
                <button type="button" onClick={() => void save(false)}>Speichern</button>
                <button type="button" onClick={() => void save(true)}>Exportieren</button>
              </div>
            ) : null}
          </div>
          <span className="save-state" data-testid="save-state">{saveStatus(dirty, saving, recoveryStamp, libraryId !== null || view === 'home')}</span>
        </div>
      </header>
      {banner ? (
        <div className="banner" role="alert">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)}>Schließen</button>
        </div>
      ) : null}
      {recovery && view === 'board' ? (
        <div className="banner" role="status" data-testid="recovery-banner">
          <span>Es gibt eine automatisch gesicherte Sitzung. Die ursprüngliche Datei wurde nicht überschrieben.</span>
          <button type="button" data-testid="recovery-restore" onClick={() => { loadJson(recovery, null, true); setRecovery(null); }}>Wiederherstellen</button>
          <button type="button" onClick={() => { setRecovery(null); void api.clearRecovery(); }}>Verwerfen</button>
        </div>
      ) : null}
      {view === 'home' ? (
        <Home
          recovery={recovery}
          onOpen={(id) => void openLibrary(id)}
          onAdoptRecovery={() => {
            if (!recovery) return;
            void api.libraryImport(recovery).then((result) => {
              if (result.ok) void openLibrary(result.id);
              else setBanner(result.error);
            });
          }}
          onDismissRecovery={() => setRecovery(null)}
        />
      ) : null}
      {view === 'board' ? <div className="workspace">
        <aside className="toolbar" aria-label="Werkzeuge">
          <ToolButton id="tool-select" label="Auswahl" pressed={tool === 'select'} onClick={() => { setTool('select'); setMoreOpen(false); }}>
            <IconSelect />
          </ToolButton>
          <ToolButton id="tool-note" label="Notiz" pressed={tool === 'note'} onClick={() => { setTool('note'); setMoreOpen(false); }}>
            <IconNote />
          </ToolButton>
          <ToolButton id="tool-heading" label="Große Überschrift" pressed={tool === 'heading'} onClick={() => { setTool('heading'); setMoreOpen(false); }}>
            <IconHeading />
          </ToolButton>
          <ToolButton id="tool-subheading" label="Kleine Überschrift" pressed={tool === 'subheading'} onClick={() => { setTool('subheading'); setMoreOpen(false); }}>
            <IconSubheading />
          </ToolButton>
          <ToolButton id="tool-image" label="Bild" pressed={tool === 'image'} onClick={() => void addImage()}>
            <IconImage />
          </ToolButton>
          <ToolButton id="tool-column" label="Spalte" pressed={tool === 'column'} onClick={() => { setTool('column'); setMoreOpen(false); }}>
            <IconColumn />
          </ToolButton>
          <ToolButton id="tool-todo" label="Aufgaben" pressed={tool === 'todo'} onClick={() => { setTool('todo'); setMoreOpen(false); }}>
            <IconTodo />
          </ToolButton>
          <ToolButton id="tool-line" label="Linie" pressed={tool === 'line'} onClick={() => { setTool('line'); setLineDraft(null); setMoreOpen(false); }}>
            <IconArrow />
          </ToolButton>
          <ToolButton id="tool-more" label="Mehr" pressed={moreOpen || tool === 'subboard'} buttonRef={moreButtonRef} onClick={() => setMoreOpen((open) => !open)}>
            <IconMore />
          </ToolButton>
          {moreOpen
            ? createPortal(
                <div className="more-pop is-portal" role="menu" data-testid="more-menu" style={moreMenuStyle(moreButtonRef.current)}>
                  <button type="button" data-testid="more-board" onClick={() => { setTool('subboard'); setMoreOpen(false); }}>Unterboard</button>
                  <div className="sticker-row">
                    {(['star', 'heart', 'thumbs', 'smiley', 'arrow'] as StickerKind[]).map((kind) => (
                      <button key={kind} type="button" draggable data-testid={`sticker-${kind}`} aria-label={kind} onDragStart={(event) => event.dataTransfer.setData('application/x-whiteboard-tool', `sticker:${kind}`)} onClick={() => addStickerAt(kind)}>
                        {kind === 'star' ? '★' : kind === 'heart' ? '♥' : kind === 'thumbs' ? '👍' : kind === 'smiley' ? '☺' : '➜'}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body,
              )
            : null}
        </aside>
        <main className="stage">
          <BoardCanvas
            key={current.id}
            board={current}
            syncToken={syncToken}
            editingId={editingId}
            focusId={focusId}
            connect={false}
            tool={tool}
            lookup={lookup}
            placementRef={placementRef}
            onCreate={createAt}
            onPositions={(updates) => {
              const before = dragBefore.current;
              const moved = moveCards(histRef.current.present, current.id, updates);
              if (!moved.ok) return;
              let present = moved.doc;
              if (before && selectedLines.length > 0 && updates[0]) {
                const origin = getBoard(before, current.id)?.cards.find((card) => card.id === updates[0].id);
                if (origin) {
                  const shifted = translateLines(
                    before,
                    current.id,
                    selectedLines,
                    updates[0].x - origin.x,
                    updates[0].y - origin.y,
                    new Set(updates.map((item) => item.id)),
                  );
                  if (shifted.ok) {
                    const lines = getBoard(shifted.doc, current.id)?.lines ?? [];
                    present = {
                      ...present,
                      boards: present.boards.map((board) => (board.id === current.id ? { ...board, lines } : board)),
                    };
                  }
                }
              }
              live(present);
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
              if (result.ok) live(result.doc);
            }}
            onDragStart={() => {
              dragBefore.current = structuredClone(histRef.current.present);
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
                }
                histRef.current = endGesture(replacePresent(histRef.current, present), before, present, sameContent);
                setHist(histRef.current);
                setSyncToken((value) => value + 1);
              });
            }}
            onDelete={async (ids) => {
              const board = getBoard(histRef.current.present, current.id);
              const titles = board?.cards.flatMap((card) => {
                if (!ids.includes(card.id) || card.type !== 'board') return [];
                return [getBoard(histRef.current.present, card.boardId)?.title ?? 'Unterboard'];
              }) ?? [];
              if (titles.length > 0 && !(await api.confirmDeleteBoards(titles))) return [];
              const result = deleteCards(histRef.current.present, current.id, ids);
              if (!result.ok) {
                setBanner(result.error);
                return [];
              }
              commit(result.doc);
              return ids.filter((id) => board?.cards.some((card) => card.id === id));
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
            selectRevision={selectRevision}
            forcedSelection={selectedIds}
            onPaneClear={() => setSelectedLines([])}
            onDropTool={onDropTool}
            onLinePoint={placeLine}
            onLineHover={setLineCursor}
            onSelectLine={(id) => setSelectedLines(id ? [id] : [])}
            onDrawLine={drawLine}
            onLineGestureStart={() => {
              dragBefore.current = structuredClone(histRef.current.present);
            }}
            onLineEndMove={(id, which, point) => {
              const before = dragBefore.current;
              if (!before) return;
              const board = getBoard(before, boardRef.current);
              if (!board) return;
              const anchor = snapAnchor(point, board.cards, board.viewport.zoom);
              const result = updateLine(before, boardRef.current, id, { [which]: anchor });
              if (result.ok) live(result.doc);
              setDockHover(anchor.kind === 'card' ? anchor.cardId : null);
            }}
            onLineBodyMove={(id, dx, dy) => {
              const before = dragBefore.current;
              if (!before) return;
              const result = translateLines(before, boardRef.current, [id], dx, dy, new Set());
              if (result.ok) live(result.doc);
            }}
            onLineGestureEnd={() => {
              const before = dragBefore.current;
              dragBefore.current = null;
              setDockHover(null);
              if (!before) return;
              histRef.current = endGesture(histRef.current, before, histRef.current.present, sameContent);
              setHist(histRef.current);
            }}
            onMarquee={(rect) => {
              const board = getBoard(histRef.current.present, boardRef.current);
              if (!board) return;
              const hits = board.lines.flatMap((line) => {
                const start = anchorPosition(line.source, board.cards);
                const end = anchorPosition(line.target, board.cards);
                if (!start || !end || !lineIntersectsRect(start, end, rect)) return [];
                return [line.id];
              });
              setSelectedLines(hits);
            }}
            onLayoutSync={() => setSyncToken((value) => value + 1)}
            preview={(() => {
              if (!lineDraft || !lineCursor) return null;
              const start = anchorPosition(lineDraft, current.cards);
              if (!start) return null;
              return { x1: start.x, y1: start.y, x2: lineCursor.x, y2: lineCursor.y };
            })()}
            dockHighlight={(() => {
              const card = current.cards.find((item) => item.id === dockHover);
              if (!card) return null;
              return { x: card.x, y: card.y, width: card.width, height: card.height };
            })()}
            lines={current.lines.flatMap((line) => {
              const rawStart = anchorPosition(line.source, current.cards);
              const rawEnd = anchorPosition(line.target, current.cards);
              if (!rawStart || !rawEnd) return [];
              const visible = visibleLineEnds(rawStart, rawEnd, line.source.kind, line.target.kind);
              const start = visible.start;
              const end = visible.end;
              return [{
                id: line.id,
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                color: line.color === 'ink' ? 'currentColor' : colorFill(line.color),
                colorName: line.color,
                arrowhead: line.arrowhead,
                selected: selectedLines.includes(line.id),
                sourceKind: line.source.kind,
                targetKind: line.target.kind,
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
                  aria-label={color}
                  className="swatch"
                  style={{ background: color === 'ink' ? '#241c14' : colorFill(color) }}
                  onClick={() => {
                    const result = updateLine(histRef.current.present, current.id, selectedLine, { color });
                    if (result.ok) commit(result.doc);
                  }}
                />
              ))}
              <button type="button" data-testid="line-reverse" onClick={() => {
                const result = reverseLine(histRef.current.present, current.id, selectedLine);
                if (result.ok) commit(result.doc);
              }}>Umdrehen</button>
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
                  setSelectedLines([]);
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
                  aria-label={color}
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
        </main>
      </div> : null}
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return true;
  return target.dataset.role === 'card-editor';
}

function saveStatus(dirty: boolean, saving: boolean, recoveryStamp: string | null, inLibrary: boolean): string {
  if (saving) return 'Speichert …';
  if (!dirty) return inLibrary ? 'In der Bibliothek gespeichert' : 'Alle Änderungen gespeichert';
  if (recoveryStamp) return `Nicht in Datei gespeichert · Sicherung von ${recoveryStamp}`;
  return 'Nicht in Datei gespeichert';
}

function moreMenuStyle(button: HTMLButtonElement | null): { left: number; top: number } {
  const rect = button?.getBoundingClientRect();
  const left = (rect?.right ?? 80) + 8;
  const top = Math.max(8, Math.min((rect?.top ?? 80) - 80, window.innerHeight - 220));
  return { left, top };
}

function ToolButton({ id, label, pressed, onClick, children, buttonRef }: { id: string; label: string; pressed: boolean; onClick: () => void; children: ReactNode; buttonRef?: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={id}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
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
    </button>
  );
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
  if (color === 'yellow') return '#FFE14A';
  if (color === 'pink') return '#FF8FBE';
  if (color === 'turquoise') return '#3DDECE';
  if (color === 'green') return '#7DDE55';
  return '#FF9A2E';
}
