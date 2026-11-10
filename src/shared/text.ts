import { MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, MSG } from './limits';

export function normalizeCardText(
  input: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const text = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (text.trim().length === 0) return { ok: false, error: MSG.emptyText };
  if ([...text].length > MAX_TEXT_LENGTH) return { ok: false, error: MSG.textTooLong };
  return { ok: true, text };
}

export function normalizeStoredText(
  input: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const text = input
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if ([...text].length > MAX_TEXT_LENGTH) return { ok: false, error: MSG.textTooLong };
  return { ok: true, text };
}

export function normalizeTitle(input: string): string {
  const cleaned = input.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Neues Board';
  return [...cleaned].slice(0, MAX_TITLE_LENGTH).join('');
}

export function codePointLength(input: string): number {
  return [...input].length;
}
