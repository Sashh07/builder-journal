import { type ReactNode, useEffect, useRef, type TextareaHTMLAttributes } from "react";
import { SESSION_TYPE_TAG, type SessionType, type IdeaStatus, type Session } from "./types";

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString(undefined, opts ?? { month: "short", day: "numeric", year: "numeric" });
}

export function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function todayLong() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="tag"
      style={{
        background: `var(--tag-${color}-bg)`,
        color: `var(--tag-${color}-fg)`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * AutoTextarea — a textarea that auto-grows with content.
 * Accepts all standard textarea props. Use `minRows` to set the starting height.
 * Supports Shift+Enter (newline) natively. If you pass an onKeyDown that submits
 * on Enter, you should check `!e.shiftKey` to allow Shift+Enter newlines.
 */
export function AutoTextarea({
  value,
  minRows = 1,
  className = "notion-input",
  style,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  useEffect(() => {
    resize();
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={className}
      style={{
        resize: "none",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    />
  );
}

export function TypeTag({ type }: { type: SessionType }) {
  const t = SESSION_TYPE_TAG[type];
  return <Tag color={t.color}>{t.label}</Tag>;
}

export function StatusTag({ status }: { status: IdeaStatus }) {
  const map: Record<IdeaStatus, string> = {
    Active: "green",
    Researching: "blue",
    Paused: "gray",
    Shipped: "teal",
  };
  return <Tag color={map[status]}>{status}</Tag>;
}

export function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 px-2 -mx-2 rounded hover:bg-[var(--bg-hover)] transition-colors">
      <div className="flex items-center gap-2 w-48 shrink-0 pt-1">
        <span className="text-[var(--text-faint)] text-sm">{icon}</span>
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="flex-1 min-w-0 pt-0.5 text-sm">{children}</div>
    </div>
  );
}

export function SectionTitle({
  emoji,
  title,
  subtitle,
}: {
  emoji?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
        {emoji && <span>{emoji}</span>}
        <span>{title}</span>
      </h1>
      {subtitle && (
        <div className="text-[var(--text-muted)] text-sm mt-1">{subtitle}</div>
      )}
    </div>
  );
}

export function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function IconArchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
    </svg>
  );
}

export function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock body scroll when modal is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{ background: "rgba(0, 0, 0, 0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg shadow-xl my-auto"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="font-semibold text-sm">{title}</div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <IconX />
          </button>
        </div>
        <div className="p-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SessionDetailModal({
  session,
  onClose,
}: {
  session: Session | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={
        session ? (
          <div className="flex items-center gap-2">
            {session.win && <span title="Win">⭐</span>}
            <span>Session detail</span>
          </div>
        ) : null
      }
    >
      {session && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-faint)] uppercase tracking-wide">Date</span>
              <span className="text-[var(--text-muted)]">{fmtDate(session.date)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-faint)] uppercase tracking-wide">Type</span>
              <TypeTag type={session.type} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-faint)] uppercase tracking-wide">Mood</span>
              <span className="text-[var(--text-muted)]">{session.mood}</span>
            </div>
            {session.win && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--text-faint)] uppercase tracking-wide">Win</span>
                <span>⭐ Yes</span>
              </div>
            )}
          </div>
          <div
            className="border-t pt-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-2">
              Entry
            </div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {session.entry || (
                <em className="text-[var(--text-faint)]">(empty)</em>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
