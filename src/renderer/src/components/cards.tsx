import { Handle, NodeResizer, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MIN_BOARD_SIZE, MIN_COLUMN_SIZE, MIN_IMAGE_SIZE, MIN_STICKER_SIZE, MIN_TEXT_SIZE, MIN_TODO_SIZE, NOTE_COLORS } from '../../../shared/limits';
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
  addTodoAfter: (cardId: string, itemId: string) => void;
  deleteTodoItem: (cardId: string, itemId: string) => void;
  startEdit: (id: string) => void;
  armGesture: () => void;
  zoom: () => number;
  resizeColumnTo: (id: string, width: number) => void;
  setTextHeight: (id: string, height: number) => void;
  pendingTodoFocus: (cardId: string) => string | null;
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
  addTodoAfter: () => undefined,
  deleteTodoItem: () => undefined,
  startEdit: () => undefined,
  armGesture: () => undefined,
  zoom: () => 1,
  resizeColumnTo: () => undefined,
  setTextHeight: () => undefined,
  pendingTodoFocus: () => null,
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

export function TextCardNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<Node<FlowData, 'textCard'>>) {
  const card = lookup.text(id);
  const [draft, setDraft] = useState(card?.text ?? '');
  const measureRef = useRef<HTMLElement>(null);
  const rf = useReactFlow();
  useEffect(() => {
    if (!data.editing) setDraft(card?.text ?? '');
  }, [card?.text, data.editing]);
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node || !card) return;
    const previous = node.style.height;
    node.style.height = 'auto';
    const content = node.scrollHeight;
    node.style.height = previous;
    const min = card.style === 'heading' ? 76 : card.style === 'subheading' ? 64 : 160;
    const needed = Math.max(min, Math.min(4000, Math.ceil(content + 20)));
    if (Math.abs(needed - card.height) < 4) return;
    lookup.setTextHeight(id, needed);
    rf.setNodes((current) =>
      current.map((item) => (item.id === id ? { ...item, height: needed, style: { ...item.style, height: needed, width: card.width } } : item)),
    );
  }, [card, data.editing, draft, id, rf]);
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
      data-height={Math.round(card.height)}
      data-column={card.columnId ?? ''}
      style={color ? { background: color.fill, color: color.ink } : undefined}
    >
      <NodeResizer
        isVisible={Boolean(selected && !data.editing)}
        minWidth={MIN_TEXT_SIZE.width}
        minHeight={card.height}
        maxHeight={card.height}
        lineStyle={{ borderColor: 'var(--ink)' }}
        handleStyle={{ width: 10, height: 10, borderRadius: 4, background: 'var(--ink)', border: 'none' }}
      />
      <Handles visible={data.connect} />
      {data.editing ? (
        <textarea
          ref={measureRef as RefObject<HTMLTextAreaElement>}
          className="nodrag nopan nowheel card-editor"
          data-testid="card-editor"
          data-role="card-editor"
          autoFocus
          lang="de"
          placeholder="Hier tippen …"
          aria-label={card.style === 'note' ? 'Notiztext' : 'Überschrift'}
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
        <div ref={measureRef as RefObject<HTMLDivElement>} className="card-copy">{card.text}</div>
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

export function TodoCardNode({ id, selected, data }: NodeProps<Node<FlowData, 'todoCard'>>) {
  const card = lookup.todo(id);
  const listRef = useRef<HTMLUListElement>(null);
  const pending = lookup.pendingTodoFocus(id);
  useEffect(() => {
    if (!pending || !listRef.current) return;
    const field = listRef.current.querySelector<HTMLInputElement>(`[data-item-id="${pending}"]`);
    field?.focus();
  }, [pending, card?.items.length]);
  if (!card) return null;
  const done = card.items.filter((item) => item.done).length;
  const focusItem = (itemId: string) => {
    const field = listRef.current?.querySelector<HTMLInputElement>(`[data-item-id="${itemId}"]`);
    field?.focus();
  };
  return (
    <article
      className={`card card-todo${selected ? ' is-selected' : ''}`}
      data-model-x={Math.round(card.x)}
      data-model-y={Math.round(card.y)}
      data-height={Math.round(card.height)}
      data-column={card.columnId ?? ''}
    >
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
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            const first = card.items[0];
            if (first) focusItem(first.id);
          }
        }}
      />
      <p className="todo-progress">{done}/{card.items.length}</p>
      <ul ref={listRef}>
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
              data-item-id={item.id}
              aria-label="Eintrag"
              value={item.text}
              onFocus={() => lookup.armGesture()}
              onBlur={() => lookup.finishEdit()}
              onChange={(event) => lookup.commitTodoItem(id, item.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  lookup.addTodoAfter(id, item.id);
                }
                if (event.key === 'Backspace' && item.text === '') {
                  event.preventDefault();
                  event.stopPropagation();
                  lookup.deleteTodoItem(id, item.id);
                }
                if (event.key === 'ArrowUp' && index > 0) {
                  event.preventDefault();
                  const previous = card.items[index - 1];
                  if (previous) focusItem(previous.id);
                }
                if (event.key === 'ArrowDown' && index < card.items.length - 1) {
                  event.preventDefault();
                  const next = card.items[index + 1];
                  if (next) focusItem(next.id);
                }
              }}
            />
          </li>
        ))}
      </ul>
      <button type="button" className="nodrag nopan todo-add" data-testid="todo-add" onClick={() => lookup.addTodoAfter(id, card.items.at(-1)?.id ?? '')}>
        + Eintrag
      </button>
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
