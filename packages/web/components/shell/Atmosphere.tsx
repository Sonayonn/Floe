/** Deep-water atmosphere: a static depth gradient + slow-drifting "caustic"
 *  light blooms, all driven by transform/opacity only. No SVG filters
 *  (feTurbulence/feDisplacementMap froze the browser) — GPU-cheap by design. */
export function Atmosphere() {
  return (
    <div className="floe-atmosphere" aria-hidden>
      <div className="floe-atmosphere__flow" />
      <div className="floe-atmosphere__caustic floe-atmosphere__caustic--a" />
      <div className="floe-atmosphere__caustic floe-atmosphere__caustic--b" />
      <div className="floe-atmosphere__caustic floe-atmosphere__caustic--c" />
      <div className="floe-atmosphere__surface" />
    </div>
  );
}
