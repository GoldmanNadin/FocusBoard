import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_COMMENT_SIZE, DEFAULT_HEADING_SIZE, DEFAULT_SUBHEADING_SIZE, DEFAULT_TEXT_SIZE, MIN_BOARD_SIZE, MIN_LINK_SIZE, MIN_SHAPE_SIZE, MIN_SKETCH_SIZE, MIN_SWATCH_SIZE, MIN_TABLE_SIZE, MIN_FILE_SIZE, MIN_COLUMN_SIZE, MIN_IMAGE_SIZE, MIN_STICKER_SIZE, MIN_TEXT_SIZE, MIN_TODO_SIZE, NOTE_COLORS } from '../../../shared/limits';
import type { BoardCard, FileCard, ImageCard, LineColor, LinkCard, ShapeCard, SketchCard, SketchStroke, StickerCard, SwatchCard, TableCard, TextCard } from '../../../shared/model';
import type { FlowData } from '../flow';
import { StickerArt } from './stickerArt';
import { renderCardText } from '../markdown';
import { extensionOf, formatBytes } from '../../../shared/attachments';

const sides = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const;

export type CardLookup = {
  text: (id: string) => TextCard | undefined;
  image: (id: string) => ImageCard | undefined;
  boardTitle: (boardId: string) => string;
  fileUrl: (fileId: string) => { url: string; name: string } | undefined;
  sticker: (id: string) => StickerCard | undefined;
  boardCard: (id: string) => BoardCard | undefined;
  commitText: (id: string, text: string) => void;
  commitTitle: (boardId: string, title: string) => void;
  openBoard: (boardId: string) => void;
  finishEdit: () => void;
  column: (id: string) => import('../../../shared/model').ColumnCard | undefined;
  todo: (id: string) => import('../../../shared/model').TodoCard | undefined;
  toggleColumn: (id: string) => void;
  commitColumnTitle: (id: string, title: string) => void;
  commitTodoTitle: (id: string, title: string) => void;
  commitTodoItem: (cardId: string, itemId: string, text: string) => void;
  toggleTodo: (cardId: string, itemId: string) => void;
  addTodoAfter: (cardId: string, itemId: string) => string | null;
  fitTextHeight: (id: string, height: number) => void;
  link: (id: string) => LinkCard | undefined;
  sketch: (id: string) => SketchCard | undefined;
  swatch: (id: string) => SwatchCard | undefined;
  updateSwatch: (id: string, patch: { color?: string; label?: string }) => void;
  shape: (id: string) => ShapeCard | undefined;
  commitShapeText: (id: string, text: string) => void;
  notify: (text: string) => void;
  table: (id: string) => TableCard | undefined;
  file: (id: string) => FileCard | undefined;
  openFile: (id: string) => void;
  saveFile: (id: string) => void;
  setCell: (id: string, row: number, col: number, text: string) => void;
  tableOp: (id: string, op: 'addRow' | 'addColumn' | 'removeRow' | 'removeColumn', after?: number) => void;
  copyText: (text: string) => void;
  addStroke: (id: string, stroke: SketchStroke) => void;
  undoStroke: (id: string) => void;
  openLink: (url: string) => void;
  deleteTodoItem: (cardId: string, itemId: string) => void;
  startEdit: (id: string) => void;
  armGesture: () => void;
  zoom: () => number;
  resizeColumnTo: (id: string, width: number) => void;
};

let lookup: CardLookup = {
  text: () => undefined,
  image: () => undefined,
  boardTitle: () => '',
  fileUrl: () => undefined,
  sticker: () => undefined,
  boardCard: () => undefined,
  commitText: () => undefined,
  commitTitle: () => undefined,
  openBoard: () => undefined,
  finishEdit: () => undefined,
  column: () => undefined,
  todo: () => undefined,
  toggleColumn: () => undefined,
  commitColumnTitle: () => undefined,
  commitTodoTitle: () => undefined,
  commitTodoItem: () => undefined,
  toggleTodo: () => undefined,
  addTodoAfter: () => null,
  fitTextHeight: () => undefined,
  link: () => undefined,
  sketch: () => undefined,
  swatch: () => undefined,
  updateSwatch: () => undefined,
  shape: () => undefined,
  commitShapeText: () => undefined,
  notify: () => undefined,
  table: () => undefined,
  file: () => undefined,
  openFile: () => undefined,
  saveFile: () => undefined,
  setCell: () => undefined,
  tableOp: () => undefined,
  copyText: () => undefined,
  addStroke: () => undefined,
  undoStroke: () => undefined,
  openLink: () => undefined,
  deleteTodoItem: () => undefined,
  startEdit: () => undefined,
  armGesture: () => undefined,
  zoom: () => 1,
  resizeColumnTo: () => undefined,
};

export function setCardLookup(next: CardLookup) {
  lookup = next;
}

function Handles({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      {sides.map(([id, position]) => (
        <Handle key={id} id={id} type="source" position={position} />
      ))}
    </>
  );
}

function resizer(selected: boolean | undefined, min: { width: number; height: number }) {
  return (
    <NodeResizer
      isVisible={Boolean(selected)}
      minWidth={min.width}
      minHeight={min.height}
      lineStyle={{ borderColor: 'var(--ink)' }}
      handleStyle={{ width: 10, height: 10, borderRadius: 4, background: 'var(--ink)', border: 'none' }}
    />
  );
}

/**
 * Undo history for the note editor. Typing is grouped into words: a new step starts with a space or
 * line break typed after a word, or after a pause of more than a second, so Ctrl+Z removes whole words.
 */
type TextHistory = { past: { value: string; caret: number }[]; future: { value: string; caret: number }[]; current: string; caret: number; at: number };

function createTextHistory(value: string): TextHistory {
  return { past: [], future: [], current: value, caret: value.length, at: 0 };
}

function recordTyping(history: TextHistory, value: string, caret: number) {
  if (value === history.current) return;
  const now = Date.now();
  const added = value.length > history.current.length ? value.slice(caret - (value.length - history.current.length), caret) : '';
  // A space typed right after a word starts the next step, so undo removes " word" pieces.
  const wordBoundary = /^\s$/.test(added) && /\S/.test(history.current.slice(history.caret - 1, history.caret));
  const startStep = history.past.length === 0 || now - history.at > 1000 || wordBoundary || added.length !== 1;
  if (startStep) history.past.push({ value: history.current, caret: history.caret });
  if (history.past.length > 200) history.past.shift();
  history.future = [];
  history.current = value;
  history.caret = caret;
  history.at = now;
}

function undoTyping(history: TextHistory): { value: string; caret: number } | null {
  const step = history.past.pop();
  if (!step) return null;
  history.future.push({ value: history.current, caret: history.caret });
  history.current = step.value;
  history.caret = step.caret;
  history.at = 0;
  return step;
}

function redoTyping(history: TextHistory): { value: string; caret: number } | null {
  const step = history.future.pop();
  if (!step) return null;
  history.past.push({ value: history.current, caret: history.caret });
  history.current = step.value;
  history.caret = step.caret;
  history.at = 0;
  return step;
}

/** Keys typed after a card was created but before its editor appeared; inserted once it is ready. */
let earlyTyping = '';

export function bufferEarlyTyping(key: string) {
  earlyTyping = (earlyTyping + key).slice(-200);
  // If the editor is already on screen (it just has not got the focus yet), write straight into it.
  const editor = document.querySelector<HTMLTextAreaElement>('textarea.card-editor, textarea.shape-editor');
  if (editor) flushEarlyTyping(editor);
}

export function clearEarlyTyping() {
  earlyTyping = '';
}

function flushEarlyTyping(field: HTMLTextAreaElement | null) {
  if (!field || !earlyTyping) return;
  const text = earlyTyping;
  earlyTyping = '';
  field.focus();
  document.execCommand('insertText', false, text);
}

/** Width-only resizing for text cards: their height always follows the text. */
function widthResizer(selected: boolean | undefined, minWidth: number) {
  if (!selected) return null;
  const style = { borderColor: 'var(--ink)', borderWidth: 2 };
  return (
    <>
      <NodeResizeControl position="left" variant={ResizeControlVariant.Line} resizeDirection="horizontal" minWidth={minWidth} style={style} />
      <NodeResizeControl position="right" variant={ResizeControlVariant.Line} resizeDirection="horizontal" minWidth={minWidth} style={style} />
    </>
  );
}

function baseTextHeight(style: TextCard['style']): number {
  if (style === 'heading') return DEFAULT_HEADING_SIZE.height;
  if (style === 'subheading') return DEFAULT_SUBHEADING_SIZE.height;
  if (style === 'comment') return DEFAULT_COMMENT_SIZE.height;
  return DEFAULT_TEXT_SIZE.height;
}

export function TextCardNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<Node<FlowData, 'textCard'>>) {
  const card = lookup.text(id);
  const [draft, setDraft] = useState(card?.text ?? '');
  const measureRef = useRef<HTMLDivElement>(null);
  const typing = useRef(createTextHistory(card?.text ?? ''));
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!data.editing) return;
    typing.current = createTextHistory(card?.text ?? '');
    flushEarlyTyping(editorRef.current);
  }, [data.editing]);
  useEffect(() => {
    if (!data.editing) setDraft(card?.text ?? '');
  }, [card?.text, data.editing]);
  const shown = data.editing ? draft : (card?.text ?? '');
  useLayoutEffect(() => {
    const mirror = measureRef.current;
    if (!card || !mirror) return;
    // Mirror text height + the 8 px margin above and below + the 1 px border on each side.
    const needed = Math.ceil(mirror.offsetHeight + 18);
    lookup.fitTextHeight(id, Math.max(baseTextHeight(card.style), needed));
  }, [id, shown, card?.width, card?.style, card?.height, document.documentElement.dataset.font, data]);
  if (!card) return null;
  const color = card.color ? NOTE_COLORS[card.color] : null;
  return (
    <article
      className={`card text-${card.style}${selected ? ' is-selected' : ''}${data.editing ? ' is-editing nodrag' : ''}`}
      data-color={card.color ?? 'none'}
      data-x={Math.round(positionAbsoluteX)}
      data-y={Math.round(positionAbsoluteY)}
      data-model-x={Math.round(card.x)}
      data-model-y={Math.round(card.y)}
      data-column={card.columnId ?? ''}
      style={color ? { background: color.fill, color: color.ink } : undefined}
    >
      {widthResizer(selected && !data.editing, MIN_TEXT_SIZE.width)}
      <Handles visible={data.connect} />
      <div ref={measureRef} className={`card-measure${data.editing ? ' is-raw' : ''}`} aria-hidden="true">
        {data.editing ? (
          <>
            {shown}
            {'\u200b'}
          </>
        ) : shown ? (
          renderCardText(shown, () => undefined)
        ) : (
          'Leere Notiz'
        )}
      </div>
      {data.editing ? (
        <textarea
          ref={editorRef}
          className="nodrag nopan nowheel card-editor"
          data-testid="card-editor"
          data-role="card-editor"
          autoFocus
          lang="de"
          aria-label={card.style === 'note' ? 'Notiztext' : card.style === 'comment' ? 'Kommentar' : 'Überschrift'}
          placeholder={card.style === 'note' ? 'Hier tippen …' : card.style === 'comment' ? 'Anmerkung …' : 'Überschrift'}
          // Uncontrolled on purpose: React never writes into the field while typing, so the
          // browser's own undo groups typing into words instead of single characters.
          defaultValue={draft}
          onFocus={(event) => {
            // Continue writing at the end of the existing text, not in front of it.
            const end = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(end, end);
          }}
          onChange={(event) => {
            recordTyping(typing.current, event.target.value, event.target.selectionEnd);
            setDraft(event.target.value);
            lookup.commitText(id, event.target.value);
          }}
          onBlur={() => lookup.finishEdit()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
              return;
            }
            const meta = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (meta && (key === 'z' || key === 'y')) {
              event.preventDefault();
              event.stopPropagation();
              const step = key === 'y' || event.shiftKey ? redoTyping(typing.current) : undoTyping(typing.current);
              if (step) {
                const field = event.currentTarget;
                field.value = step.value;
                field.setSelectionRange(step.caret, step.caret);
                setDraft(step.value);
                lookup.commitText(id, step.value);
              }
              return;
            }
            const marker = meta && event.key.toLowerCase() === 'b' ? '**' : meta && event.key.toLowerCase() === 'i' ? '*' : null;
            if (marker) {
              event.preventDefault();
              const field = event.currentTarget;
              const { selectionStart: start, selectionEnd: end, value } = field;
              const selected = value.slice(start, end);
              // insertText keeps the change in the browser's undo history (Ctrl+Z removes the marks again).
              document.execCommand('insertText', false, `${marker}${selected}${marker}`);
              field.setSelectionRange(start + marker.length, start + marker.length + selected.length);
            }
          }}
        />
      ) : (
        <div className={`card-copy md${card.text ? '' : ' is-empty'}`}>
          {card.text ? renderCardText(card.text, (url) => lookup.openLink(url)) : card.style === 'note' ? 'Leere Notiz' : card.style === 'comment' ? 'Leerer Kommentar' : 'Überschrift'}
        </div>
      )}
    </article>
  );
}

export function ImageCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'imageCard'>>) {
  const card = lookup.image(id);
  const file = card ? lookup.fileUrl(card.fileId) : undefined;
  return (
    <article className={`card card-image${selected ? ' is-selected' : ''}`}>
      <NodeResizer
        isVisible={Boolean(selected)}
        keepAspectRatio
        minWidth={MIN_IMAGE_SIZE.width}
        minHeight={MIN_IMAGE_SIZE.height}
        lineStyle={{ borderColor: 'var(--ink)' }}
        handleStyle={{ width: 10, height: 10, borderRadius: 4, background: 'var(--ink)', border: 'none' }}
      />
      <Handles visible={data.connect} />
      {file ? <img src={file.url} alt={file.name} draggable={false} /> : <p>Bild fehlt</p>}
    </article>
  );
}

export function BoardCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'boardCard'>>) {
  const card = lookup.boardCard(id);
  const title = card ? lookup.boardTitle(card.boardId) : '';
  const [draft, setDraft] = useState(title);
  useEffect(() => {
    if (!data.editing) setDraft(title);
  }, [title, data.editing]);
  if (!card) return null;
  return (
    <article className={`card card-board${selected ? ' is-selected' : ''}${data.editing ? ' is-editing nodrag' : ''}`}>
      {resizer(selected && !data.editing, MIN_BOARD_SIZE)}
      <Handles visible={data.connect} />
      <p className="kicker">Unterboard</p>
      {data.editing ? (
        <input
          className="nodrag nopan nowheel title-editor"
          data-testid="title-editor"
          data-role="card-editor"
          autoFocus
          aria-label="Titel des Unterboards"
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setDraft(event.target.value);
            lookup.commitTitle(card.boardId, event.target.value);
          }}
          onBlur={() => lookup.finishEdit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <h2>{title}</h2>
      )}
      <button type="button" className="nodrag nopan open-board" onClick={() => lookup.openBoard(card.boardId)}>
        Öffnen
      </button>
    </article>
  );
}

export function ColumnCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'columnCard'>>) {
  const card = lookup.column(id);
  const [draft, setDraft] = useState(card?.title ?? '');
  useEffect(() => {
    if (!data.editing) setDraft(card?.title ?? '');
  }, [card?.title, data.editing]);
  if (!card) return null;
  return (
    <article
      className={`card card-column${selected ? ' is-selected' : ''}${card.collapsed ? ' is-collapsed' : ''}`}
      data-model-x={Math.round(card.x)}
      data-model-y={Math.round(card.y)}
      data-width={Math.round(card.width)}
      data-collapsed={card.collapsed ? '1' : '0'}
      data-children={card.childIds.join(' ')}
    >
      {resizer(selected && !data.editing, MIN_COLUMN_SIZE)}
      <Handles visible={data.connect} />
      <header className="column-handle">
        {data.editing ? (
          <input
            className="nodrag nopan nowheel title-editor"
            data-role="card-editor"
            data-testid="column-title"
            autoFocus
            aria-label="Spaltentitel"
            value={draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              setDraft(event.target.value);
              lookup.commitColumnTitle(id, event.target.value);
            }}
            onBlur={() => lookup.finishEdit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
            }}
          />
        ) : (
          <button type="button" className="column-title" onDoubleClick={() => lookup.startEdit(id)}>
            {card.title}
          </button>
        )}
        <button type="button" className="nodrag nopan" aria-label={card.collapsed ? 'Aufklappen' : 'Zuklappen'} onClick={() => lookup.toggleColumn(id)}>
          {card.collapsed ? '▸' : '▾'}
        </button>
        <div
          className="column-width nodrag nopan"
          role="slider"
          aria-label="Spaltenbreite"
          aria-valuemin={180}
          aria-valuemax={4000}
          aria-valuenow={Math.round(card.width)}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            lookup.armGesture();
            const start = event.clientX;
            const startWidth = card.width;
            const zoom = lookup.zoom() || 1;
            const move = (next: PointerEvent) => lookup.resizeColumnTo(id, startWidth + (next.clientX - start) / zoom);
            const up = () => {
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
              lookup.finishEdit();
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        />
      </header>
    </article>
  );
}

/** Item that should receive the cursor once it has been rendered (after Enter or Backspace). */
let pendingTodoFocus: string | null = null;

function focusTodoItem(itemId: string) {
  const input = document.querySelector<HTMLInputElement>(`[data-item-id="${CSS.escape(itemId)}"]`);
  if (!input) return false;
  input.focus();
  const end = input.value.length;
  input.setSelectionRange(end, end);
  return true;
}

export function TodoCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'todoCard'>>) {
  const card = lookup.todo(id);
  const itemKey = card?.items.map((item) => item.id).join(' ') ?? '';
  useEffect(() => {
    if (pendingTodoFocus && focusTodoItem(pendingTodoFocus)) pendingTodoFocus = null;
  }, [itemKey]);
  if (!card) return null;
  const done = card.items.filter((item) => item.done).length;
  const move = (event: ReactKeyboardEvent<HTMLInputElement>, index: number) => {
    const target = card.items[index];
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    focusTodoItem(target.id);
  };
  return (
    <article className={`card card-todo${selected ? ' is-selected' : ''}`} data-model-x={Math.round(card.x)} data-model-y={Math.round(card.y)} data-column={card.columnId ?? ''}>
      {resizer(selected, MIN_TODO_SIZE)}
      <Handles visible={data.connect} />
      <input
        className="nodrag nopan nowheel todo-title"
        data-role="card-editor"
        aria-label="Titel der Liste"
        value={card.title}
        onFocus={() => lookup.armGesture()}
        onBlur={() => lookup.finishEdit()}
        onChange={(event) => lookup.commitTodoTitle(id, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'ArrowDown') move(event, 0);
        }}
      />
      <p className="todo-progress">{done}/{card.items.length}</p>
      <ul>
        {card.items.map((item, index) => (
          <li key={item.id}>
            <input
              className="nodrag nopan"
              type="checkbox"
              aria-label="Erledigt"
              checked={item.done}
              onChange={() => lookup.toggleTodo(id, item.id)}
            />
            <input
              className={`nodrag nopan nowheel todo-item${item.done ? ' is-done' : ''}`}
              data-role="card-editor"
              aria-label="Eintrag"
              data-item-id={item.id}
              placeholder="Neuer Eintrag"
              value={item.text}
              onFocus={() => lookup.armGesture()}
              onBlur={() => lookup.finishEdit()}
              onChange={(event) => lookup.commitTodoItem(id, item.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  pendingTodoFocus = lookup.addTodoAfter(id, item.id);
                } else if (event.key === 'Backspace' && item.text === '' && card.items.length > 1) {
                  event.preventDefault();
                  event.stopPropagation();
                  pendingTodoFocus = card.items[index - 1]?.id ?? card.items[index + 1]?.id ?? null;
                  lookup.deleteTodoItem(id, item.id);
                } else if (event.key === 'ArrowUp') {
                  move(event, index - 1);
                } else if (event.key === 'ArrowDown') {
                  move(event, index + 1);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

export function StickerCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'stickerCard'>>) {
  const card = lookup.sticker(id);
  if (!card) return null;
  return (
    <article className={`card card-sticker${selected ? ' is-selected' : ''}`} aria-label="Sticker">
      {resizer(selected, MIN_STICKER_SIZE)}
      <Handles visible={data.connect} />
      <StickerArt kind={card.kind} />
    </article>
  );
}

export function LinkCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'linkCard'>>) {
  const card = lookup.link(id);
  if (!card) return null;
  let host = card.url;
  try {
    host = new URL(card.url).host;
  } catch {
    // keep the raw address
  }
  return (
    <article className={`card card-link${selected ? ' is-selected' : ''}`} data-url={card.url} data-column={card.columnId ?? ''}>
      {resizer(selected, MIN_LINK_SIZE)}
      <Handles visible={data.connect} />
      <p className="kicker">Link · {host}</p>
      <h2 className="link-title" title={card.url}>{card.title || host}</h2>
      <button type="button" className="nodrag nopan open-board" data-testid="open-link" onClick={() => lookup.openLink(card.url)}>
        Im Browser öffnen ↗
      </button>
    </article>
  );
}

const PEN_COLORS: { color: LineColor; label: string; fill: string }[] = [
  { color: 'ink', label: 'Schwarz', fill: 'var(--ink)' },
  { color: 'pink', label: 'Rosa', fill: NOTE_COLORS.pink.fill },
  { color: 'orange', label: 'Orange', fill: NOTE_COLORS.orange.fill },
  { color: 'turquoise', label: 'Türkis', fill: NOTE_COLORS.turquoise.fill },
  { color: 'green', label: 'Grün', fill: NOTE_COLORS.green.fill },
  { color: 'yellow', label: 'Gelb', fill: NOTE_COLORS.yellow.fill },
  { color: 'blue', label: 'Blau', fill: NOTE_COLORS.blue.fill },
  { color: 'purple', label: 'Lila', fill: NOTE_COLORS.purple.fill },
];

/** The pen survives between sketches, like a real pen on the desk. */
let pen: { color: LineColor; width: number } = { color: 'ink', width: 3 };

function strokeColor(color: LineColor): string {
  return color === 'ink' ? 'var(--ink)' : NOTE_COLORS[color].fill;
}

function polyline(points: number[]): string {
  let out = '';
  for (let i = 0; i + 1 < points.length; i += 2) out += `${points[i]},${points[i + 1]} `;
  return out;
}

export function SketchCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'sketchCard'>>) {
  const card = lookup.sketch(id);
  const articleRef = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [tool, setTool] = useState(pen);
  useEffect(() => {
    if (!data.editing) return;
    // Clicking anywhere outside the sketch ends drawing, like clicking outside a note.
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && articleRef.current?.contains(event.target)) return;
      lookup.finishEdit();
    };
    window.addEventListener('pointerdown', outside, true);
    return () => window.removeEventListener('pointerdown', outside, true);
  }, [data.editing]);
  if (!card) return null;
  const choose = (next: Partial<typeof pen>) => {
    pen = { ...pen, ...next };
    setTool(pen);
  };
  const toPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };
  return (
    <article ref={articleRef} className={`card card-sketch${selected ? ' is-selected' : ''}${data.editing ? ' is-editing nodrag' : ''}`} data-strokes={card.strokes.length} data-column={card.columnId ?? ''}>
      {!data.editing ? (
        <NodeResizer
          isVisible={Boolean(selected)}
          keepAspectRatio
          minWidth={MIN_SKETCH_SIZE.width}
          minHeight={MIN_SKETCH_SIZE.height}
          lineStyle={{ borderColor: 'var(--ink)' }}
          handleStyle={{ width: 10, height: 10, borderRadius: 4, background: 'var(--ink)', border: 'none' }}
        />
      ) : null}
      <Handles visible={data.connect} />
      <svg
        className={`sketch-surface${data.editing ? ' nodrag nopan nowheel is-drawing' : ''}`}
        data-testid="sketch-surface"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        onPointerDown={(event) => {
          if (!data.editing || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDraft(toPoint(event));
        }}
        onPointerMove={(event) => {
          if (!draft) return;
          setDraft([...draft, ...toPoint(event)]);
        }}
        onPointerUp={() => {
          if (!draft) return;
          lookup.addStroke(id, { color: tool.color, width: tool.width, points: draft });
          setDraft(null);
        }}
      >
        {card.strokes.map((stroke, index) => (
          <polyline key={index} points={polyline(stroke.points)} stroke={strokeColor(stroke.color)} strokeWidth={stroke.width} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {draft ? (
          <polyline points={polyline(draft.length === 2 ? [...draft, ...draft] : draft)} stroke={strokeColor(tool.color)} strokeWidth={tool.width} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </svg>
      {!data.editing && card.strokes.length === 0 ? <p className="sketch-hint">Doppelklick zum Zeichnen</p> : null}
      {data.editing ? (
        <div className="sketch-tools nodrag nopan" role="toolbar" aria-label="Stift">
          {PEN_COLORS.map((entry) => (
            <button
              key={entry.color}
              type="button"
              className="swatch"
              aria-label={entry.label}
              aria-pressed={tool.color === entry.color}
              data-testid={`pen-${entry.color}`}
              style={{ background: entry.fill }}
              onClick={() => choose({ color: entry.color })}
            />
          ))}
          <button type="button" aria-pressed={tool.width === 3} onClick={() => choose({ width: 3 })}>Fein</button>
          <button type="button" aria-pressed={tool.width === 8} onClick={() => choose({ width: 8 })}>Dick</button>
          <button type="button" data-testid="sketch-undo" disabled={card.strokes.length === 0} onClick={() => lookup.undoStroke(id)}>Strich weg</button>
          <button type="button" data-testid="sketch-done" className="sketch-done" onClick={() => lookup.finishEdit()}>Fertig</button>
        </div>
      ) : null}
    </article>
  );
}

export function SwatchCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'swatchCard'>>) {
  const card = lookup.swatch(id);
  if (!card) return null;
  const copy = () => {
    lookup.copyText(card.color.toUpperCase());
  };
  return (
    <article className={`card card-swatch${selected ? ' is-selected' : ''}${data.editing ? ' is-editing nodrag' : ''}`} data-color={card.color} data-column={card.columnId ?? ''}>
      {resizer(selected && !data.editing, MIN_SWATCH_SIZE)}
      <Handles visible={data.connect} />
      <div className="swatch-fill" style={{ background: card.color }} />
      {data.editing ? (
        <div className="swatch-edit nodrag nopan">
          <input
            type="color"
            aria-label="Farbe wählen"
            data-role="card-editor"
            value={card.color}
            onChange={(event) => lookup.updateSwatch(id, { color: event.target.value })}
          />
          <input
            className="title-editor"
            data-testid="swatch-label"
            data-role="card-editor"
            autoFocus
            aria-label="Name der Farbe"
            placeholder="Name"
            defaultValue={card.label}
            onChange={(event) => lookup.updateSwatch(id, { label: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                lookup.finishEdit();
              }
            }}
          />
        </div>
      ) : (
        <div className="swatch-meta">
          {card.label ? <span className="swatch-label">{card.label}</span> : null}
          <button type="button" className="nodrag nopan swatch-hex" data-testid="swatch-hex" title="HEX-Wert kopieren" onClick={copy}>
            {card.color.toUpperCase()}
          </button>
        </div>
      )}
    </article>
  );
}

function shapeOutline(shape: ShapeCard['shape']) {
  if (shape === 'ellipse') return <ellipse cx="50" cy="50" rx="49" ry="49" />;
  if (shape === 'diamond') return <polygon points="50,1 99,50 50,99 1,50" />;
  return <rect x="1" y="1" width="98" height="98" rx="10" ry="10" />;
}

export function ShapeCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'shapeCard'>>) {
  const card = lookup.shape(id);
  if (!card) return null;
  const color = NOTE_COLORS[card.color];
  return (
    <article className={`card card-shape shape-${card.shape}${selected ? ' is-selected' : ''}${data.editing ? ' is-editing nodrag' : ''}`} data-shape={card.shape} data-color={card.color} data-column={card.columnId ?? ''} style={{ color: color.ink }}>
      {resizer(selected && !data.editing, MIN_SHAPE_SIZE)}
      <Handles visible={data.connect} />
      <svg className="shape-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={{ fill: color.fill }}>
        {shapeOutline(card.shape)}
      </svg>
      {data.editing ? (
        <textarea
          ref={(field) => flushEarlyTyping(field)}
          className="nodrag nopan nowheel shape-text shape-editor"
          data-testid="shape-editor"
          data-role="card-editor"
          autoFocus
          aria-label="Text in der Form"
          placeholder="Text"
          defaultValue={card.text}
          onChange={(event) => lookup.commitShapeText(id, event.target.value)}
          onBlur={() => lookup.finishEdit()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <div className="shape-text">{card.text}</div>
      )}
    </article>
  );
}

/** Cell that should get the cursor after a row was added by Enter in the last row. */
let pendingCell: { id: string; row: number; col: number } | null = null;

/** Asks a table card to put the cursor into a cell as soon as it is rendered. */
export function requestCellFocus(id: string, row: number, col: number) {
  pendingCell = { id, row, col };
}

function focusCell(id: string, row: number, col: number): boolean {
  const input = document.querySelector<HTMLInputElement>(`[data-table="${CSS.escape(id)}"][data-row="${row}"][data-col="${col}"]`);
  if (!input) return false;
  input.focus();
  input.select();
  return true;
}

export function TableCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'tableCard'>>) {
  const card = lookup.table(id);
  const shape = card ? `${card.rows.length}x${card.rows[0]?.length ?? 0}` : '';
  useEffect(() => {
    if (pendingCell && pendingCell.id === id && focusCell(id, pendingCell.row, pendingCell.col)) pendingCell = null;
  }, [shape, id]);
  if (!card) return null;
  const cols = card.rows[0]?.length ?? 0;
  return (
    <article className={`card card-table${selected ? ' is-selected' : ''}`} data-rows={card.rows.length} data-cols={cols} data-column={card.columnId ?? ''}>
      {widthResizer(selected, MIN_TABLE_SIZE.width)}
      <Handles visible={data.connect} />
      {selected ? (
        <div className="table-tools nodrag nopan" role="toolbar" aria-label="Tabelle">
          <button type="button" data-testid="table-add-row" onClick={() => lookup.tableOp(id, 'addRow')}>+ Zeile</button>
          <button type="button" data-testid="table-add-col" onClick={() => lookup.tableOp(id, 'addColumn')}>+ Spalte</button>
          <button type="button" data-testid="table-remove-row" disabled={card.rows.length <= 1} onClick={() => lookup.tableOp(id, 'removeRow')}>− Zeile</button>
          <button type="button" data-testid="table-remove-col" disabled={cols <= 1} onClick={() => lookup.tableOp(id, 'removeColumn')}>− Spalte</button>
        </div>
      ) : null}
      <table>
        <tbody>
          {card.rows.map((cells, row) => (
            <tr key={row} className={row === 0 ? 'is-head' : undefined}>
              {cells.map((cell, col) => (
                <td key={col}>
                  <input
                    className="nodrag nopan nowheel"
                    data-role="card-editor"
                    data-table={id}
                    data-row={row}
                    data-col={col}
                    aria-label={`Zeile ${row + 1}, Spalte ${col + 1}`}
                    value={cell}
                    onFocus={() => lookup.armGesture()}
                    onBlur={() => lookup.finishEdit()}
                    onChange={(event) => lookup.setCell(id, row, col, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        event.stopPropagation();
                        if (row + 1 < card.rows.length) focusCell(id, row + 1, col);
                        else if (event.key === 'Enter') {
                          pendingCell = { id, row: row + 1, col };
                          lookup.tableOp(id, 'addRow');
                        }
                      } else if (event.key === 'ArrowUp' && row > 0) {
                        event.preventDefault();
                        event.stopPropagation();
                        focusCell(id, row - 1, col);
                      }
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

const FILE_BADGES: Record<string, string> = { pdf: '#d64545', docx: '#2b579a', odt: '#2b579a', rtf: '#2b579a', xlsx: '#217346', ods: '#217346', csv: '#217346', pptx: '#d24726', odp: '#d24726', zip: '#7a6a4f' };

export function FileCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'fileCard'>>) {
  const card = lookup.file(id);
  if (!card) return null;
  const ext = extensionOf(card.name);
  return (
    <article className={`card card-file${selected ? ' is-selected' : ''}`} data-name={card.name} data-column={card.columnId ?? ''}>
      {widthResizer(selected, MIN_FILE_SIZE.width)}
      <Handles visible={data.connect} />
      <div className="file-row">
        <span className="file-badge" style={{ background: FILE_BADGES[ext] ?? '#5c5146' }} aria-hidden="true">
          {ext.toUpperCase()}
        </span>
        <span className="file-meta">
          <strong title={card.name}>{card.name}</strong>
          <span>{formatBytes(card.size)}</span>
        </span>
      </div>
      <div className="file-actions">
        <button type="button" className="nodrag nopan" data-testid="file-open" onClick={() => lookup.openFile(id)}>Öffnen</button>
        <button type="button" className="nodrag nopan" data-testid="file-save" onClick={() => lookup.saveFile(id)}>Speichern…</button>
      </div>
    </article>
  );
}
