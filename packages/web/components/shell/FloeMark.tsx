/** The Floe glyph as inline SVG so it inherits `currentColor`
 *  (lets it sit on a colored button in the button's ink color). */
export function FloeMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden fill="currentColor">
      <g fillOpacity="0.5">
        <polygon points="50,8 15,42 50,42" />
        <polygon points="50,8 85,42 50,42" />
      </g>
      <polygon points="15,42 50,42 50,94" />
      <polygon points="85,42 50,42 50,94" />
      <rect x="8" y="40.3" width="84" height="3.4" rx="1.7" />
    </svg>
  );
}
