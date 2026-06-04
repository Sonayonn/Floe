// Confirm: with scale 1e9, is the full SVI smile sane across strikes? And ATM vol stable?
const S = 1e9;
const a = 839329/S, b = 18313192/S, m = 41245144/S, rho = 166977/S, sigma = 31264120/S;
const TTE_ms = 112087536;
const T = TTE_ms/(365.25*24*3600*1000);
console.log(`params: a=${a.toFixed(6)} b=${b.toFixed(6)} m=${m.toFixed(6)} rho=${rho.toFixed(6)} sigma=${sigma.toFixed(6)} T=${T.toFixed(5)}y`);
// w(k) = a + b*(rho*(k-m) + sqrt((k-m)^2 + sigma^2))
const w = (k:number)=> a + b*(rho*(k-m) + Math.sqrt((k-m)**2 + sigma**2));
const iv = (k:number)=> Math.sqrt(Math.max(w(k),0)/T)*100;
console.log('smile (log-moneyness k -> IV%):');
for (const k of [-0.1,-0.05,0,0.05,0.1]) console.log(`  k=${k.toFixed(2)}: IV=${iv(k).toFixed(1)}%`);
console.log(`ATM (k=0): w0=${w(0).toFixed(6)}  IV=${iv(0).toFixed(2)}%`);
// also: minimum variance (SVI floor) should be >= 0
console.log(`min total variance (a + b*sigma*sqrt(1-rho^2)) = ${(a + b*sigma*Math.sqrt(1-rho*rho)).toFixed(6)}`);
