import { FORMAT, FORMAT_VERSION, NOTE_COLOR_ORDER, STICKER_KINDS } from './limits';

export type HandleSide = 'top' | 'right' | 'bottom' | 'left';
export type TextStyle = 'note' | 'heading' | 'subheading';
export type NoteColor = (typeof NOTE_COLOR_ORDER)[number];
export type StickerKind = (typeof STICKER_KINDS)[number];
export type ThemeName = 'light' | 'dark';

type Placed = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columnId: string | null;
};

export type TextCard = Placed & {
  type: 'text';
  text: string;
  style: TextStyle;
  color: NoteColor | null;
};

export type LinkCard = Placed & {
  type: 'link';
  url: string;
  title: string;
};

export type ImageCard = Placed & {
  type: 'image';
  fileId: string;
};

export type BoardCard = Placed & {
  type: 'board';
  boardId: string;
};

export type StickerCard = Placed & {
  type: 'sticker';
  kind: StickerKind;
};

export type TodoItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TodoCard = Placed & {
  type: 'todo';
  title: string;
  items: TodoItem[];
};

export type ColumnCard = {
  id: string;
  type: 'column';
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  collapsed: boolean;
  childIds: string[];
};

export type Card = TextCard | ImageCard | BoardCard | StickerCard | TodoCard | ColumnCard | LinkCard;

export type LineColor = NoteColor | 'ink';

export type LineAnchor =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'card'; cardId: string; side: HandleSide; t: number };

export type CanvasLine = {
  id: string;
  source: LineAnchor;
  target: LineAnchor;
  color: LineColor;
  arrowhead: boolean;
};

export type Connector = {
  id: string;
  source: string;
  target: string;
  sourceHandle: HandleSide | null;
  targetHandle: HandleSide | null;
};

export type BoardViewport = { x: number; y: number; zoom: number };

export type Board = {
  id: string;
  title: string;
  parentBoardId: string | null;
  cards: Card[];
  connectors: Connector[];
  lines: CanvasLine[];
  viewport: BoardViewport;
};

export type ImageFile = {
  id: string;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  dataUrl: string;
  byteSize: number;
};

export type WhiteboardDocument = {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  appVersion: string;
  rootBoardId: string;
  theme: ThemeName;
  boards: Board[];
  files: ImageFile[];
};

export type DocResult = { ok: true; doc: WhiteboardDocument } | { ok: false; error: string };
