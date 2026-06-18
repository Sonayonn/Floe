import type { VenueStatus } from "@floe/sdk/browser";
import { VenueMark } from "./Logo";

export function VenueChip({ venueKey, name, status }: { venueKey: string; name: string; status: VenueStatus }) {
  const live = status === "live";
  return (
    <span className={`k-tag k-tag--lg${live ? " k-tag--accent" : ""}`} style={{ gap: 8 }} title={live ? "Live on testnet" : "Activates at mainnet"}>
      <VenueMark venueKey={venueKey} size={20} live={live} />
      {name}{!live && " · mainnet"}
    </span>
  );
}
