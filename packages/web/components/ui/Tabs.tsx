"use client";
import { useState } from "react";

export function Tabs({ tabs, initial = 0 }: { tabs: { label: string; content: React.ReactNode }[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: "var(--space-6)" }}>
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            style={{
              appearance: "none", background: "none", border: "none", cursor: "pointer",
              padding: "10px 14px", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500,
              color: i === active ? "var(--text)" : "var(--text-subtle)",
              borderBottom: i === active ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, transition: "color var(--dur-fast) var(--ease-out)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{tabs[active].content}</div>
    </div>
  );
}
