/** 6dp bigint (dUSDC/NAV/share price) -> display string */
export function fmt6(v: bigint, dp = 2): string {
  const neg = v < 0n; const x = neg ? -v : v;
  const whole = x / 1_000_000n; const frac = x % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, dp);
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + (dp > 0 ? "." + fracStr : "");
}
/** compact money: 8.36, 1.2M, etc. (6dp input) */
export function fmtMoney(v: bigint): string {
  const n = Number(v) / 1e6;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
export function shortAddr(a: string): string {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}
export function pct(n: number, dp = 1): string {
  return (n * 100).toFixed(dp) + "%";
}
/** signed percent for growth chips: +0.90%, -47.4% */
export function pctSigned(n: number, dp = 2): string {
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(dp) + "%";
}
/** human "2d ago", "3h ago", "just now" from an epoch-ms timestamp */
export function fmtRelative(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  const m = 60_000, h = 3_600_000, day = 86_400_000;
  if (d < m) return "just now";
  if (d < h) return `${Math.floor(d / m)}m ago`;
  if (d < day) return `${Math.floor(d / h)}h ago`;
  const days = Math.floor(d / day);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
/** short axis date: "Jun 16" */
export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** span in days between two epoch-ms (>=0), rounded to 1dp when small */
export function spanDays(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / 86_400_000);
}
