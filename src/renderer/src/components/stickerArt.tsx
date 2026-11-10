import type { StickerKind } from '../../../shared/model';

export function StickerArt({ kind }: { kind: StickerKind }) {
  if (kind === 'star') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 6l7.2 16.4L57 24.2 42.6 35.2 47 53 32 43.6 17 53l4.4-17.8L7 24.2l17.8-1.8L32 6z" fill="#FFE14A" stroke="#1A1408" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'heart') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 54S10 40.5 10 25.5C10 17 16 12 23 12c4.2 0 7.2 2.2 9 5.4C33.8 14.2 36.8 12 41 12c7 0 13 5 13 13.5C54 40.5 32 54 32 54z" fill="#FF8FBE" stroke="#2A0A18" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'thumbs') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M18 28h8V52h-8a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4z" fill="#FF9A2E" stroke="#2A1200" strokeWidth="3" />
        <path d="M26 30l8-16c2-4 8-2 8 3v9h10c4 0 6 4 5 8l-3 16c-1 4-4 6-8 6H26V30z" fill="#FFE14A" stroke="#2A1200" strokeWidth="3" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'smiley') {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="22" fill="#7DDE55" stroke="#102408" strokeWidth="3" />
        <circle cx="24" cy="28" r="2.4" fill="#102408" />
        <circle cx="40" cy="28" r="2.4" fill="#102408" />
        <path d="M22 38c2.8 5 7 7.5 10 7.5S39.2 43 42 38" fill="none" stroke="#102408" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 32h32" fill="none" stroke="#3DDECE" strokeWidth="8" strokeLinecap="round" />
      <path d="M36 18l16 14-16 14" fill="none" stroke="#042421" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
