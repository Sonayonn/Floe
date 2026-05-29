import { fetchSurface, oneSigmaRange } from './oracle/svi.ts';

const surface = await fetchSurface();
console.log(`Active surface points: ${surface.length}\n`);

for (const p of surface) {
  console.log('─── ', p.oracleId.slice(0, 10), '…');
  console.log('  expiry  :', new Date(p.expiryMs).toISOString());
  console.log('  spot    : $' + p.spot.toFixed(2));
  console.log('  forward : $' + p.forward.toFixed(2));
  console.log('  IV      :', (p.impliedVol * 100).toFixed(1) + '%');
  console.log('  svi     :', JSON.stringify(p.svi));
  const band = oneSigmaRange(p, 1);
  console.log('  1σ range: $' + band.lowerStrike.toFixed(0) + ' — $' + band.upperStrike.toFixed(0));
  console.log('  τ (days):', (band.tauYears * 365.25).toFixed(1));
  console.log();
}
