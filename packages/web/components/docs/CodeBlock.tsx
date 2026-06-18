"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/* Lightweight curated-snippet highlighter (TS + Move). Single non-overlapping
   pass over escaped source: comments → strings → keywords → types → numbers → calls. */
const KW =
  "import|from|export|const|let|var|await|async|function|return|new|type|interface|extends|" +
  "public|private|fun|module|use|struct|has|key|store|mut|entry|if|else|for|while|true|false|null|this";

function highlight(src: string): string {
  const esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const re = new RegExp(
    [
      "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)", // comments (incl. ///)
      "('[^'\\n]*'|\"[^\"\\n]*\"|`[^`]*`)", // strings
      `(\\b(?:${KW})\\b)`, // keywords
      "(\\b[A-Z][A-Za-z0-9_]+\\b)", // Types / Namespaces
      "(\\b0x[0-9a-fA-F]+\\b|\\b\\d[\\d_]*n?\\b)", // numbers / bigint / hex
      "(\\b[a-z_][A-Za-z0-9_]*\\b)(?=\\()", // function calls
    ].join("|"),
    "g"
  );
  return esc.replace(re, (m, c, s, k, t, n, f) => {
    if (c !== undefined) return `<span class="tk-c">${c}</span>`;
    if (s !== undefined) return `<span class="tk-s">${s}</span>`;
    if (k !== undefined) return `<span class="tk-k">${k}</span>`;
    if (t !== undefined) return `<span class="tk-t">${t}</span>`;
    if (n !== undefined) return `<span class="tk-n">${n}</span>`;
    if (f !== undefined) return `<span class="tk-f">${f}</span>`;
    return m;
  });
}

export function CodeBlock({ code, lang = "ts", filename }: { code: string; lang?: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const trimmed = code.replace(/^\n+|\n+$/g, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="code">
      <div className="code__bar">
        <span className="code__dots" aria-hidden><i /><i /><i /></span>
        {filename && <span className="code__file">{filename}</span>}
        <span className="code__lang">{lang}</span>
        <button className="code__copy" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code__pre"><code dangerouslySetInnerHTML={{ __html: highlight(trimmed) }} /></pre>
    </div>
  );
}
