import type { ReactNode } from 'react';

type IconProps = { title?: string };

function Svg({ children, title }: IconProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconSelect() {
  return (
    <Svg>
      <path d="M5 4l6.2 15 1.8-5.2L18.4 12 5 4z" fill="currentColor" />
    </Svg>
  );
}

export function IconNote() {
  return (
    <Svg>
      <rect x="5" y="4" width="14" height="16" rx="4" fill="currentColor" />
    </Svg>
  );
}

export function IconHeading() {
  return (
    <Svg>
      <path d="M6 6h3v5h6V6h3v12h-3v-5H9v5H6V6z" fill="currentColor" />
    </Svg>
  );
}

export function IconSubheading() {
  return (
    <Svg>
      <path d="M7 8h2.2v3.2h5.6V8H17v8h-2.2v-3H9.2v3H7V8z" fill="currentColor" />
    </Svg>
  );
}

export function IconImage() {
  return (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" />
      <path d="M7 16l3.2-3.2 2.2 2.1L16 11l3 5H7z" fill="currentColor" />
    </Svg>
  );
}

export function IconColumn() {
  return (
    <Svg>
      <rect x="5" y="4" width="14" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconTodo() {
  return (
    <Svg>
      <rect x="5" y="4" width="14" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9l1.4 1.4L12 8M8 14h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconArrow() {
  return (
    <Svg>
      <path d="M5 12h12M13 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconMore() {
  return (
    <Svg>
      <circle cx="6" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="18" cy="12" r="1.7" fill="currentColor" />
    </Svg>
  );
}

export function IconUndo() {
  return (
    <Svg>
      <path d="M8 8H5v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5.5 10.5A7 7 0 1 1 7 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function IconRedo() {
  return (
    <Svg>
      <path d="M16 8h3v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18.5 10.5A7 7 0 1 0 17 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
