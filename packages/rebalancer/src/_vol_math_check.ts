// Validate the ATM implied-vol computation from live SVI params BEFORE porting to Move.
// SVI total variance: w(k) = a + b*(rho*(k-m) + sqrt((k-m)^2 + sigma^2))
// We need the fixed-point SCALE. Test a few candidate scales and see which yields sane BTC IV.

const a = 839329;
const b = 18313192;
const m = 41245144;       // positive
const rho = 166977;       // positive (small) — or is it scaled differently?
const sigma = 31264120;
const TTE_ms = 112087536;
const T = TTE_ms / (365.25 * 24 * 3600 * 1000); // years
console.log('time to expiry (years):', T.toFixed(5));

// At ATM, k = 0 (log-moneyness; forward≈spot so ATM strike gives k≈0)
function volForScale(scale: number) {
  const A = a / scale, B = b / scale, M = m / scale, RHO = rho / scale, SIG = sigma / scale;
  // w(0) = A + B*(RHO*(0 - M) + sqrt(M^2 + SIG^2))
  const w0 = A + B * (RHO * (0 - M) + Math.sqrt(M*M + SIG*SIG));
  const ivAnnual = Math.sqrt(Math.max(w0, 0) / T);
  return { scale, A, B, M, RHO, SIG, w0, ivAnnual };
}

for (const scale of [1e6, 1e7, 1e8, 1e9]) {
  const r = volForScale(scale);
  console.log(`scale=${scale.toExponential()}: a=${r.A.toFixed(4)} b=${r.B.toFixed(4)} m=${r.M.toFixed(4)} rho=${r.RHO.toFixed(4)} sig=${r.SIG.toFixed(4)} | w0=${r.w0.toFixed(5)} IV=${(r.ivAnnual*100).toFixed(1)}%`);
}
console.log('\n(rho should be in [-1,1]; pick the scale where rho is sane AND IV is realistic ~30-90% for BTC)');
