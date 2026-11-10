import fs from 'node:fs/promises';

export type AtomicIO = {
  open: (path: string) => Promise<{ write: (content: string) => Promise<void>; sync: () => Promise<void>; close: () => Promise<void> }>;
  copy: (from: string, to: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
};

const nodeIO: AtomicIO = {
  async open(path) {
    const handle = await fs.open(path, 'w');
    return {
      write: (content) => handle.writeFile(content, 'utf8'),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
  copy: (from, to) => fs.copyFile(from, to),
  rename: (from, to) => fs.rename(from, to),
  remove: (path) => fs.rm(path, { force: true }),
};

export async function writeAtomic(target: string, content: string, io: AtomicIO = nodeIO): Promise<void> {
  const temporary = `${target}.tmp`;
  const backup = `${target}.bak`;
  const handle = await io.open(temporary);
  try {
    await handle.write(content);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await io.remove(temporary);
    throw error;
  }
  await handle.close();
  try {
    await io.copy(target, backup);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      await io.remove(temporary);
      throw error;
    }
  }
  try {
    await io.rename(temporary, target);
  } catch (error) {
    await io.remove(temporary);
    throw error;
  }
}
