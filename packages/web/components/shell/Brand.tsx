export function Brand({ size = 22 }: { size?: number }) {
  return (
    <span className="floe-brand">
      <img className="floe-brand__mark" src="/brand/floe-mark-color.svg" alt="" style={{ height: size }} />
      <span className="floe-brand__word" style={{ fontSize: size * 0.92 }}>floe</span>
    </span>
  );
}
