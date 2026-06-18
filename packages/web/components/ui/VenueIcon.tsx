/** Floe-drawn monochrome venue/asset icons — coherent set, no third-party IP, render instantly. */
export function VenueIcon({ venue, size = 16 }: { venue: string; size?: number }) {
  const c = "currentColor";
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" } as const;
  switch (venue) {
    case "deepbook": // order-book depth bars
      return (<svg {...common}><rect x="3" y="11" width="4" height="9" rx="1" fill={c}/><rect x="10" y="6" width="4" height="14" rx="1" fill={c}/><rect x="17" y="9" width="4" height="11" rx="1" fill={c}/><rect x="3" y="4" width="18" height="2" rx="1" fill={c} opacity="0.5"/></svg>);
    case "cetus": // concentrated-liquidity wave
      return (<svg {...common}><path d="M3 14c3 0 3-5 6-5s3 5 6 5 3-5 6-5" stroke={c} strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="9" r="1.6" fill={c}/><circle cx="15" cy="14" r="1.6" fill={c}/></svg>);
    case "lending": // money-market layers
      return (<svg {...common}><rect x="4" y="6" width="16" height="4" rx="1.5" fill={c}/><rect x="4" y="12" width="16" height="4" rx="1.5" fill={c} opacity="0.6"/><rect x="6" y="18" width="12" height="2.5" rx="1.2" fill={c} opacity="0.35"/></svg>);
    case "idle": // reserve / vault dot
      return (<svg {...common}><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="2"/><circle cx="12" cy="12" r="3" fill={c}/></svg>);
    case "sui": // droplet
      return (<svg {...common}><path d="M12 3c3 4 6 7 6 11a6 6 0 11-12 0c0-4 3-7 6-11z" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>);
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="8" stroke={c} strokeWidth="2"/></svg>);
  }
}
