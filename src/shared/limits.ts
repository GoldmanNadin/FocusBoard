export const APP_VERSION = '0.4.0';
export const FORMAT = 'digitales-whiteboard' as const;
export const FORMAT_VERSION = 3 as const;

export const MAX_TEXT_LENGTH = 8000;
export const MAX_TITLE_LENGTH = 80;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;
export const MAX_CARDS_PER_BOARD = 400;
export const MAX_CONNECTORS_PER_BOARD = 800;
export const MAX_BOARDS = 200;
export const MAX_FILES = 200;
export const MAX_BOARD_DEPTH = 8;
export const COORD_LIMIT = 100_000;
export const VIEWPORT_LIMIT = 1_000_000;
export const MAX_CARD_EDGE = 4000;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export const MIN_TEXT_SIZE = { width: 140, height: 48 };
export const MIN_IMAGE_SIZE = { width: 120, height: 96 };
export const MIN_BOARD_SIZE = { width: 180, height: 96 };
export const MIN_STICKER_SIZE = { width: 64, height: 64 };
export const MIN_COLUMN_SIZE = { width: 180, height: 56 };
export const MIN_TODO_SIZE = { width: 180, height: 96 };
export const MIN_LINK_SIZE = { width: 180, height: 112 };
export const MIN_SKETCH_SIZE = { width: 120, height: 90 };
export const MIN_SWATCH_SIZE = { width: 110, height: 120 };
export const MIN_SHAPE_SIZE = { width: 60, height: 48 };
export const MAX_SKETCH_STROKES = 400;
export const MAX_SKETCH_POINTS = 40_000;
export const MAX_URL_LENGTH = 2000;

export const DEFAULT_TEXT_SIZE = { width: 220, height: 160 };
export const DEFAULT_HEADING_SIZE = { width: 340, height: 76 };
export const DEFAULT_SUBHEADING_SIZE = { width: 280, height: 64 };
export const DEFAULT_IMAGE_SIZE = { width: 280, height: 210 };
export const DEFAULT_BOARD_SIZE = { width: 230, height: 120 };
export const DEFAULT_STICKER_SIZE = { width: 104, height: 104 };
export const DEFAULT_COLUMN_SIZE = { width: 260, height: 88 };
export const DEFAULT_TODO_SIZE = { width: 240, height: 176 };
export const DEFAULT_LINK_SIZE = { width: 260, height: 124 };
export const DEFAULT_SKETCH_SIZE = { width: 360, height: 270 };
export const DEFAULT_SWATCH_SIZE = { width: 160, height: 180 };
export const DEFAULT_SHAPE_SIZE = { width: 200, height: 140 };
export const COLUMN_HEADER = 48;
export const COLUMN_PAD = 8;
export const COLUMN_GAP = 8;

export const NOTE_COLORS = {
  yellow: { fill: '#FFE14A', ink: '#1A1408' },
  pink: { fill: '#FF8FBE', ink: '#2A0A18' },
  turquoise: { fill: '#3DDECE', ink: '#042421' },
  green: { fill: '#7DDE55', ink: '#102408' },
  orange: { fill: '#FF9A2E', ink: '#2A1200' },
  white: { fill: '#FFFFFF', ink: '#1A1408' },
  blue: { fill: '#8EC5FF', ink: '#061A33' },
  purple: { fill: '#C9A7FF', ink: '#1E0C3D' },
} as const;

export const NOTE_COLOR_ORDER = ['yellow', 'orange', 'pink', 'purple', 'blue', 'turquoise', 'green', 'white'] as const;
export const NOTE_COLOR_NAMES = {
  yellow: 'Gelb',
  orange: 'Orange',
  pink: 'Rosa',
  purple: 'Lila',
  blue: 'Blau',
  turquoise: 'Türkis',
  green: 'Grün',
  white: 'Weiß',
} as const;
export const STICKER_KINDS = ['star', 'heart', 'thumbs', 'smiley', 'arrow'] as const;

export const MSG = {
  emptyText: 'Bitte einen Text eingeben.',
  textTooLong: `Der Text ist zu lang (höchstens ${MAX_TEXT_LENGTH} Zeichen).`,
  missingBoard: 'Dieses Board gibt es nicht mehr.',
  tooManyCards: 'Dieses Board hat zu viele Karten.',
  tooManyConnectors: 'Dieses Board hat zu viele Verbindungen.',
  tooManyBoards: 'Es gibt zu viele Boards.',
  tooManyFiles: 'Es gibt zu viele Bilder.',
  tooDeep: 'Die Verschachtelung ist zu tief.',
  selfConnect: 'Eine Karte kann nicht mit sich selbst verbunden werden.',
  badConnector: 'Diese Verbindung ist nicht möglich.',
  duplicateConnector: 'Diese Verbindung gibt es schon.',
  imageType: 'Die Datei ist kein unterstütztes Bild (PNG, JPEG, GIF oder WebP).',
  imageSize: 'Das Bild ist zu groß (höchstens 8 MB).',
  imageExtension: 'Die Dateiendung passt nicht zum Bildinhalt.',
  imageRead: 'Die Datei konnte nicht gelesen werden.',
  imageEmpty: 'Die Bilddatei ist leer oder beschädigt.',
  fileTooBig: 'Die Datei ist zu groß (höchstens 40 MB).',
  invalidJson: 'Die Datei enthält kein gültiges JSON.',
  invalidDoc: 'Die Datei ist kein Whiteboard-Dokument.',
  unsupportedVersion: 'Diese Dateiversion wird nicht unterstützt.',
  invalidStructure: 'Die Board-Struktur in der Datei ist ungültig.',
  orphanBoard: 'Die Datei enthält ein Board ohne Zuordnung.',
  cycle: 'Die Boards verweisen kreisförmig aufeinander.',
  danglingEdge: 'Eine Verbindung verweist auf eine fehlende Karte.',
  badImage: 'Ein eingebettetes Bild ist ungültig.',
  unusedImage: 'Die Datei enthält ein Bild, das keiner Karte zugeordnet ist.',
  duplicateId: 'Die Datei enthält doppelte Kennungen.',
  badGeometry: 'Eine Karte hat ungültige Maße oder Positionen.',
  saveFailed: 'Die Datei konnte nicht gespeichert werden.',
  unknownCard: 'Die Datei enthält einen unbekannten Kartentyp.',
  nestedColumn: 'Eine Spalte kann nicht in einer anderen Spalte liegen.',
  badLine: 'Eine Linie ist unvollständig oder zeigt auf eine fehlende Karte.',
  badUrl: 'Das ist keine gültige Web-Adresse (http oder https).',
  nothingToPaste: 'In der Zwischenablage ist nichts, das eingefügt werden kann.',
} as const;

export type CardTypeName = 'text' | 'image' | 'board' | 'sticker' | 'column' | 'todo' | 'link' | 'sketch' | 'swatch' | 'shape';

export function minSizeFor(type: CardTypeName): { width: number; height: number } {
  if (type === 'text') return MIN_TEXT_SIZE;
  if (type === 'image') return MIN_IMAGE_SIZE;
  if (type === 'sticker') return MIN_STICKER_SIZE;
  if (type === 'column') return MIN_COLUMN_SIZE;
  if (type === 'todo') return MIN_TODO_SIZE;
  if (type === 'link') return MIN_LINK_SIZE;
  if (type === 'sketch') return MIN_SKETCH_SIZE;
  if (type === 'swatch') return MIN_SWATCH_SIZE;
  if (type === 'shape') return MIN_SHAPE_SIZE;
  return MIN_BOARD_SIZE;
}

export function defaultSizeFor(type: CardTypeName): { width: number; height: number } {
  if (type === 'text') return DEFAULT_TEXT_SIZE;
  if (type === 'image') return DEFAULT_IMAGE_SIZE;
  if (type === 'sticker') return DEFAULT_STICKER_SIZE;
  if (type === 'column') return DEFAULT_COLUMN_SIZE;
  if (type === 'todo') return DEFAULT_TODO_SIZE;
  if (type === 'link') return DEFAULT_LINK_SIZE;
  if (type === 'sketch') return DEFAULT_SKETCH_SIZE;
  if (type === 'swatch') return DEFAULT_SWATCH_SIZE;
  if (type === 'shape') return DEFAULT_SHAPE_SIZE;
  return DEFAULT_BOARD_SIZE;
}
