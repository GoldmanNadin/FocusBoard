import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aboutCopy, legacyUserDataPath, LEGACY_USER_DATA_DIR, PRODUCT_NAME } from '../src/shared/identity';
import { APP_VERSION, FORMAT, FORMAT_VERSION } from '../src/shared/limits';

function icoSizes(bytes: Buffer): number[] {
  const count = bytes.readUInt16LE(4);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = bytes[entry] || 256;
    const height = bytes[entry + 1] || 256;
    sizes.push(width);
    expect(height).toBe(width);
  }
  return sizes;
}

describe('FocusBoard branding', () => {
  it('keeps the file format and the old autosave folder', () => {
    expect(PRODUCT_NAME).toBe('FocusBoard');
    expect(APP_VERSION).toBe('0.4.1');
    expect(FORMAT).toBe('digitales-whiteboard');
    expect(FORMAT_VERSION).toBe(3);
    expect(LEGACY_USER_DATA_DIR).toBe('Digitales Whiteboard');
    expect(legacyUserDataPath('/home/demo/.config')).toBe('/home/demo/.config/Digitales Whiteboard');
    expect(legacyUserDataPath('C:\\Users\\demo\\AppData\\Roaming')).toBe(
      'C:\\Users\\demo\\AppData\\Roaming\\Digitales Whiteboard',
    );
  });

  it('describes FocusBoard in the about text and keeps import compatibility', () => {
    const copy = aboutCopy(APP_VERSION);
    expect(copy.title).toBe('FocusBoard');
    expect(copy.message).toBe('FocusBoard 0.4.1');
    expect(copy.detail).toContain('MIT-Lizenz');
    expect(copy.detail).toContain('digitales-whiteboard');
    expect(copy.detail).toContain('0.3');
    expect(copy.detail).not.toMatch(/^Digitales Whiteboard/);
  });

  it('embeds every required size in the icon file', () => {
    const sizes = icoSizes(readFileSync('assets/brand/icon.ico'));
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });
});
