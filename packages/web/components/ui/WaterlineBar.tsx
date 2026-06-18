import { fmt6 } from "@/lib/format";

/** The waterline: the proven floor is the water level. What's submerged (aqua)
 *  is cryptographically certain; what's above the line is soft-marked "air".
 *  pctCertain = how full the vessel is. Floe's signature figure. */
export function WaterlineBar({
  nav,
  floor,
  pctCertain,
  symbol = "dUSDC",
}: {
  nav: bigint;
  floor: bigint;
  pctCertain: number;
  symbol?: string;
}) {
  const w = Math.max(1.5, Math.min(100, pctCertain));
  return (
    <div className="waterline">
      <div className="waterline__stats">
        <div className="waterline__stat">
          <span className="waterline__k">Net asset value</span>
          <span className="waterline__v num">
            {fmt6(nav)} <em>{symbol}</em>
          </span>
        </div>
        <div className="waterline__stat waterline__stat--floor">
          <span className="waterline__k">Proven floor</span>
          <span className="waterline__v num">
            {fmt6(floor)} <em>{symbol}</em>
          </span>
        </div>
      </div>

      <div className="waterline__track" role="img" aria-label={`${pctCertain.toFixed(1)}% cryptographically certain`}>
        <div className="waterline__fill" style={{ width: `${w}%` }}>
          <span className="waterline__shimmer" />
          <span className="waterline__line" />
        </div>
      </div>

      <div className="waterline__axis">
        <span className="waterline__certain">
          <span className="waterline__pct num">{pctCertain.toFixed(1)}%</span> cryptographically certain
        </span>
        <span className="waterline__full">full mark</span>
      </div>
    </div>
  );
}
