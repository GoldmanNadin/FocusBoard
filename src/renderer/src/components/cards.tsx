import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_HEADING_SIZE, DEFAULT_SUBHEADING_SIZE, DEFAULT_TEXT_SIZE, MIN_BOARD_SIZE, MIN_COLUMN_SIZE, MIN_IMAGE_SIZE, MIN_STICKER_SIZE, MIN_TEXT_SIZE, MIN_TODO_SIZE, NOTE_COLORS } from '../../../shared/limits';
import type { BoardCard, ImageCard, StickerCard, TextCard } from '../../../shared/model';
import type { FlowData } from '../flow';
import { StickerArt } from './stickerArt';

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
  return DEFAULT_TEXT_SIZE.height;
}

export function TextCardNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<Node<FlowData, 'textCard'>>) {
  const card = lookup.text(id);
  const [draft, setDraft] = useState(card?.text ?? '');
  const measureRef = useRef<HTMLDivElement>(null);
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
  }, [id, shown, card?.width, card?.style, card?.height]);
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
      <div ref={measureRef} className="card-measure" aria-hidden="true">
        {shown}
        {'\u200b'}
      </div>
      {data.editing ? (
        <textarea
          className="nodrag nopan nowheel card-editor"
          data-testid="card-editor"
          data-role="card-editor"
          autoFocus
          lang="de"
          aria-label={card.style === 'note' ? 'Notiztext' : 'Überschrift'}
          placeholder={card.style === 'note' ? 'Hier tippen …' : 'Überschrift'}
          value={draft}
          onChange={(event) => {
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
            }
          }}
        />
      ) : (
        <div className={`card-copy${card.text ? '' : ' is-empty'}`}>{card.text || (card.style === 'note' ? 'Leere Notiz' : 'Überschrift')}</div>
      )}
    </article>
  );
}

export function ImageCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'imageCard'>>) {
  const card = lookup.image(id);
  const file = card ? lookup.fileUrl(card.fileId) : undefined;
  return (
    <article className={`card card-image${selected ? ' is-selected' : ''}`}>
      {resizer(selected, MIN_IMAGE_SIZE)}
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
