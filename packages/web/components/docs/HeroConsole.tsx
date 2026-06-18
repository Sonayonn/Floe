/* A glassy "live SDK" console for the docs hero — illustrative of the read
   surface (representative testnet values from the live Stratos vault). */
export function HeroConsole() {
  return (
    <div className="dx-console" aria-hidden>
      <div className="dx-console__glow" />
      <div className="dx-console__bar">
        <span className="code__dots"><i /><i /><i /></span>
        <span className="dx-console__title">sdk-tour.ts · testnet</span>
        <span className="dx-console__live"><i /> live</span>
      </div>
      <pre className="dx-console__body">
<span className="dx-l"><span className="tk-c">$</span> <span className="tk-f">floe</span> sdk-tour <span className="tk-k">--network</span> <span className="tk-s">testnet</span></span>
<span className="dx-l dx-l--gap"><span className="tk-t">VAULT</span>   Floe Stratos</span>
<span className="dx-l">  nav        <span className="tk-n">$2.96</span>   share <span className="tk-n">$0.526</span></span>
<span className="dx-l">  attested   <span className="tk-ok">✓</span> hardware tier</span>
<span className="dx-l dx-l--gap"><span className="tk-t">VOL</span>     <span className="tk-n">51.32%</span>  BTC ATM · on-chain</span>
<span className="dx-l dx-l--gap"><span className="tk-t">ATTEST</span>  enclave <span className="tk-ok">live ✓</span></span>
<span className="dx-l">  pcr0       <span className="tk-s">b4d53224…2c031</span></span>
<span className="dx-l">  nav signed <span className="tk-ok">→ verified on-chain</span></span>
<span className="dx-l dx-l--ok">✓ every surface live<span className="dx-cursor" /></span>
      </pre>
    </div>
  );
}
