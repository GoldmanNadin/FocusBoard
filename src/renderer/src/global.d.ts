import type { WhiteboardApi } from '../../preload/index';

declare global {
  interface Window {
    whiteboard?: WhiteboardApi;
  }
}

declare module '*.png' {
  const source: string;
  export default source;
}

export {};
