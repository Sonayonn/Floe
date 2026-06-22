"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, X, ExternalLink } from "lucide-react";
import { suiTx } from "@/lib/explorer";

type ToastKind = "pending" | "success" | "error" | "info";
export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Optional tx digest → renders an explorer link. */
  digest?: string;
  /** ms before auto-dismiss; 0 = sticky (used for pending). */
  ttl?: number;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** App-wide toast access. Safe to call anywhere under <ToastProvider>; returns no-ops if absent. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { push: () => "", update: () => {}, dismiss: () => {} };
}

let seq = 0;
const DEFAULT_TTL = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id]; }
  }, []);

  const arm = useCallback((id: string, ttl: number | undefined) => {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    if (ttl && ttl > 0) timers.current[id] = setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = `t${++seq}`;
    const ttl = t.ttl ?? (t.kind === "pending" ? 0 : DEFAULT_TTL);
    setToasts((cur) => [...cur.slice(-3), { ...t, id, ttl }]);
    arm(id, ttl);
    return id;
  }, [arm]);

  const update = useCallback((id: string, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.kind || patch.ttl !== undefined) {
      const ttl = patch.ttl ?? (patch.kind === "pending" ? 0 : DEFAULT_TTL);
      arm(id, ttl);
    }
  }, [arm]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  return (
    <ToastContext.Provider value={{ push, update, dismiss }}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role="status" aria-live="polite">
            <span className="toast__icon">
              {t.kind === "pending" && <Loader2 size={16} className="toast__spin" />}
              {t.kind === "success" && <CheckCircle2 size={16} />}
              {t.kind === "error" && <AlertTriangle size={16} />}
              {t.kind === "info" && <CheckCircle2 size={16} />}
            </span>
            <div className="toast__body">
              <span className="toast__title">{t.title}</span>
              {t.message && <span className="toast__msg">{t.message}</span>}
              {t.digest && (
                <a className="toast__link" href={suiTx(t.digest)} target="_blank" rel="noreferrer">
                  View on explorer <ExternalLink size={11} />
                </a>
              )}
            </div>
            <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
