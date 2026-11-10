import { FORMAT, FORMAT_VERSION, NOTE_COLOR_ORDER, STICKER_KINDS } from './limits';

export type HandleSide = 'top' | 'right' | 'bottom' | 'left';
export type TextStyle = 'note' | 'heading' | 'subheading' | 'comment';
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

/** One pen stroke; points are a flat [x, y, x, y, …] list, each value 0…1 relative to the card. */
export type SketchStroke = {
  color: LineColor;
  width: number;
  points: number[];
};

export type SketchCard = Placed & {
  type: 'sketch';
  strokes: SketchStroke[];
};

export type SwatchCard = Placed & {
  type: 'swatch';
  /** #rrggbb */
  color: string;
  label: string;
};

export type ShapeKind = 'rect' | 'ellipse' | 'diamond';

export type ShapeCard = Placed & {
  type: 'shape';
  shape: ShapeKind;
  color: NoteColor;
  text: string;
};

export type TableCard = Placed & {
  type: 'table';
  /** rows[0] is the header row; every row has the same number of cells. */
  rows: string[][];
};

/** An attached document, embedded as a base64 data URL. Only harmless document types are allowed. */
export type FileCard = Placed & {
  type: 'file';
  name: string;
  mime: string;
  size: number;
  data: string;
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

export type Card = TextCard | ImageCard | BoardCard | StickerCard | TodoCard | ColumnCard | LinkCard | SketchCard | SwatchCard | ShapeCard | TableCard | FileCard;

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
  /** Sideways offset of the curve's middle from the straight line, in board units; 0 or missing = straight. */
  bend?: number;
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
