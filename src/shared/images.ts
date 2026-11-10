import { MAX_IMAGE_BYTES, MSG } from './limits';

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

const EXT: Record<ImageMime, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
};

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'bild';
  const cleaned = base.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const sliced = [...cleaned].slice(0, 120).join('');
  return sliced || 'bild';
}

export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function decodeBase64(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function extensionOf(fileName: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : null;
}

export type InspectedImage = {
  fileName: string;
  mimeType: ImageMime;
  dataUrl: string;
  byteSize: number;
};

export function inspectImageBytes(
  bytes: Uint8Array,
  fileName: string,
): { ok: true; image: InspectedImage } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: MSG.imageEmpty };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: MSG.imageSize };
  const mimeType = detectImageMime(bytes);
  if (!mimeType) return { ok: false, error: MSG.imageType };
  const safeName = sanitizeFileName(fileName);
  const ext = extensionOf(safeName);
  if (ext && !EXT[mimeType].includes(ext)) return { ok: false, error: MSG.imageExtension };
  const dataUrl = `data:${mimeType};base64,${encodeBase64(bytes)}`;
  return {
    ok: true,
    image: { fileName: safeName, mimeType, dataUrl, byteSize: bytes.byteLength },
  };
}

const DATA_URL =
  /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function inspectImageDataUrl(
  dataUrl: string,
  fileName: string,
): { ok: true; image: InspectedImage } | { ok: false; error: string } {
  if (dataUrl.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64) {
    return { ok: false, error: MSG.imageSize };
  }
  const match = DATA_URL.exec(dataUrl);
  if (!match) return { ok: false, error: MSG.imageType };
  const bytes = decodeBase64(match[2]);
  if (!bytes) return { ok: false, error: MSG.badImage };
  const inspected = inspectImageBytes(bytes, fileName);
  if (!inspected.ok) return inspected;
  if (inspected.image.mimeType !== match[1]) return { ok: false, error: MSG.badImage };
  return inspected;
}
