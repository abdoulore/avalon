// The Avalon mark: a two-tone "A" rising from water with a play button in its
// counter. Inline SVG (same geometry as app/icon.svg) so it stays crisp from
// favicon to hero and needs no asset request.
export function AvalonMark({ size = 22, className = "" }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      <path d="M256 60 L76 380 Q136 396 196 380 L256 236 Z" fill="#2F8178" />
      <path d="M256 60 L436 380 Q376 396 316 380 L256 236 Z" fill="#1E4A78" />
      <path d="M236 268 L236 344 L298 306 Z" fill="#F3A81E" />
      <path d="M140 404 q30 -20 60 0 t60 0 t60 0 t60 0 t60 0" fill="none" stroke="#3EC9DC" strokeWidth="16" strokeLinecap="round" />
      <path d="M96 444 q30 -20 60 0 t60 0 t60 0 t60 0 t60 0" fill="none" stroke="#3EC9DC" strokeWidth="16" strokeLinecap="round" />
    </svg>
  );
}
