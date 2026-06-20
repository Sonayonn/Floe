/** Floe-official vaults carry this; user/3rd-party vaults do not. */
export function OfficialBadge() {
  return (
    <span className="k-tag k-tag--accent" style={{ gap: 7 }}>
      <img src="/logos/floe.svg" alt="" width={16} height={16} style={{ display: "block" }} /> Floe
    </span>
  );
}
