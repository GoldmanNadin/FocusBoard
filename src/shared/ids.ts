const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

export function isValidId(value: string): boolean {
  return ID_RE.test(value);
}

export function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `id-${time}-${rand}`;
}
