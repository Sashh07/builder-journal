import React, { useState, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { useAppState, useTheme, currentPhaseWeek, sessionsLastNDays, sessionsThisWeek, startOfWeek } from "./state";
import { initStorage, importAllData, migrateLocalToSupabase, loadKey, saveKey, type ImportResult, type SyncStatus } from "./storage";
import {
  uid, fmtDate, fmtShortDate, todayLong,
  Tag, TypeTag, StatusTag, PropertyRow, SectionTitle, AutoTextarea,
  IconPlus, IconTrash, IconCheck, IconCopy, IconMoon, IconSun, IconX, IconArchive, IconEdit, IconSettings, IconGrip,
  Modal, SessionDetailModal,
} from "./ui";
import {
  sessionTypeLabel, resolveSessionType, TAG_COLORS, MOODS, PHASE_WEEKS,
  type Session, type SessionType, type CustomSessionType, type Mood, type IdeaStatus, type PythonLevel,
  type Idea, type Blocker, type ReflectionEntry,
} from "./types";
import Dashboard from "./tabs/Dashboard";
import Ideas from "./tabs/Ideas";
import Reflect from "./tabs/Reflect";

// ─── Minimal inline tabs ────────────────────────────────────────────────────

// ─── Session type manager ───────────────────────────────────────────────────
// Inline modal for adding / renaming / recoloring / deleting session types.
// Persisted to Supabase via app.update("sessionTypes", ...). Deletion is
// graceful-orphan: existing sessions keep their stored type id and render via
// TypeTag's fallback, so no history is lost and nothing is reassigned.

function slugifyId(label: string, existing: CustomSessionType[]): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "type";
  let id = base;
  let n = 2;
  while (existing.some((t) => t.id === id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

function ColorSwatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          title={c}
          className="w-6 h-6 rounded-md transition-transform hover:scale-110"
          style={{
            background: `var(--tag-${c}-bg)`,
            border: value === c ? "2px solid var(--text)" : "2px solid transparent",
            boxShadow: value === c ? "0 0 0 1px var(--bg)" : "none",
          }}
        >
          <span
            className="block w-full h-full rounded-[3px]"
            style={{ background: `var(--tag-${c}-fg)`, opacity: 0.55 }}
          />
        </button>
      ))}
    </div>
  );
}

// A colored badge that, when clicked, opens a swatch popover to recolor it.
// Closes on pick or click-outside. Replaces the old separate "Colors" section.
function ColorBadgePicker({
  label,
  color,
  onPick,
}: {
  label: string;
  color: string;
  onPick: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Click to change color"
        className="cursor-pointer rounded transition-opacity hover:opacity-80"
      >
        <Tag color={color}>{label}</Tag>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-20 p-2.5 rounded-lg shadow-xl"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", width: 232 }}
        >
          <ColorSwatches
            value={color}
            onPick={(c) => { onPick(c); setOpen(false); }}
          />
        </div>
      )}
    </div>
  );
}

function SessionTypeManager({
  open,
  onClose,
  app,
}: {
  open: boolean;
  onClose: () => void;
  app: ReturnType<typeof useAppState>;
}) {
  const { state, update } = app;

  // Draft state — all edits happen here and only commit on Save. Seeded from
  // the live list each time the modal opens.
  const [draft, setDraft] = useState<CustomSessionType[]>(state.sessionTypes);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<string>("indigo");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Reseed draft whenever the modal opens (or the live list changes while closed).
  useEffect(() => {
    if (open) {
      setDraft(state.sessionTypes);
      setNewLabel("");
      setNewColor("indigo");
      setError("");
      setDragId(null);
      setOverId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.sessionTypes),
    [draft, state.sessionTypes]
  );

  // Usage counts come from the real sessions, keyed by id (ids are stable in the draft).
  const usageCount = (id: SessionType) =>
    state.sessions.filter((s) => s.type === id).length;

  const addType = () => {
    const label = newLabel.trim();
    if (!label) { setError("Give the type a name."); return; }
    if (draft.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      setError("A type with that name already exists.");
      return;
    }
    const id = slugifyId(label, draft);
    setDraft([...draft, { id, label, color: newColor }]);
    setNewLabel("");
    setError("");
  };

  const renameType = (id: string, label: string) =>
    setDraft(draft.map((t) => (t.id === id ? { ...t, label } : t)));

  const recolorType = (id: string, color: string) =>
    setDraft(draft.map((t) => (t.id === id ? { ...t, color } : t)));

  const deleteType = (id: string) =>
    setDraft(draft.filter((t) => t.id !== id));

  // ── Drag-to-reorder (native HTML5 DnD, no extra deps) ──
  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== overId) setOverId(id);
  };
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const from = draft.findIndex((t) => t.id === dragId);
    const to = draft.findIndex((t) => t.id === targetId);
    if (from === -1 || to === -1) { setDragId(null); setOverId(null); return; }
    const next = [...draft];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraft(next);
    setDragId(null);
    setOverId(null);
  };

  // ── Save / cancel with unsaved-changes guard ──
  const save = () => {
    update("sessionTypes", draft);
    onClose();
  };
  const requestClose = () => {
    if (dirty) {
      const ok = window.confirm("Discard unsaved changes to session types?");
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={requestClose} title="Edit session types">
      <div className="space-y-5">
        {/* Existing types — drag to reorder */}
        <div className="space-y-2">
          {draft.length === 0 ? (
            <div className="text-sm text-[var(--text-faint)] py-4 text-center border rounded" style={{ borderColor: "var(--border)" }}>
              No types yet. Add one below.
            </div>
          ) : (
            draft.map((t) => {
              const count = usageCount(t.id);
              const isDragging = dragId === t.id;
              const isOver = overId === t.id && dragId !== t.id;
              return (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => onDragStart(t.id)}
                  onDragOver={(e) => onDragOver(e, t.id)}
                  onDrop={() => onDrop(t.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  className="flex items-center gap-2 border rounded-lg px-2 py-2.5 transition-colors"
                  style={{
                    borderColor: isOver ? "var(--accent)" : "var(--border)",
                    background: "var(--bg-subtle)",
                    opacity: isDragging ? 0.4 : 1,
                  }}
                >
                  <span
                    className="shrink-0 cursor-grab active:cursor-grabbing text-[var(--text-faint)] hover:text-[var(--text-muted)] px-1"
                    title="Drag to reorder"
                  >
                    <IconGrip />
                  </span>
                  <ColorBadgePicker
                    label={t.label || t.id}
                    color={t.color}
                    onPick={(c) => recolorType(t.id, c)}
                  />
                  <input
                    className="notion-input flex-1 text-sm"
                    value={t.label}
                    onChange={(e) => renameType(t.id, e.target.value)}
                    placeholder="Type name"
                    style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
                  />
                  <span className="text-[11px] text-[var(--text-faint)] shrink-0 w-20 text-right">
                    {count} session{count === 1 ? "" : "s"}
                  </span>
                  <button
                    className="icon-btn shrink-0"
                    onClick={() => deleteType(t.id)}
                    title={count > 0 ? `Delete — ${count} past session${count === 1 ? "" : "s"} will keep this label greyed out` : "Delete type"}
                  >
                    <IconTrash />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Add new type */}
        <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-2">Add a type</div>
          <div className="flex items-start gap-2 mb-3">
            <input
              className="notion-input flex-1 text-sm"
              placeholder="e.g. PitWall build"
              value={newLabel}
              onChange={(e) => { setNewLabel(e.target.value); if (error) setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
              style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
            />
            <button className="btn shrink-0" onClick={addType}>
              <IconPlus /> Add
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] shrink-0">Color</span>
            <ColorBadgePicker
              label={newLabel.trim() || "Preview"}
              color={newColor}
              onPick={setNewColor}
            />
            <span className="text-[10px] text-[var(--text-faint)]">click to change</span>
          </div>
          {error && (
            <div className="text-xs mt-2" style={{ color: "var(--tag-coral-fg)" }}>{error}</div>
          )}
        </div>

        <div className="text-[11px] text-[var(--text-faint)] border-t pt-3" style={{ borderColor: "var(--border)" }}>
          Drag the handle to reorder. Deleting a type leaves past sessions intact — they keep the label in grey. Re-add a type with the same name to restore its color. Changes aren't saved until you click Save.
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          {dirty && <span className="text-[11px] text-[var(--text-faint)] mr-auto">Unsaved changes</span>}
          <button className="btn" onClick={requestClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty}>Save changes</button>
        </div>
      </div>
    </Modal>
  );
}

function SessionLog({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, addSession, deleteSession } = app;
  const sessionTypes = state.sessionTypes;
  const [type, setType] = useState<SessionType>(sessionTypes[0]?.id ?? "");
  const [mood, setMood] = useState<Mood>("Focused");
  const [entry, setEntry] = useState("");
  const [win, setWin] = useState(false);
  const [filter, setFilter] = useState<"all" | SessionType>("all");
  const [entryError, setEntryError] = useState<string>("");
  const [manageOpen, setManageOpen] = useState(false);

  // Keep the selected type valid: if the chosen type is deleted (or none is
  // selected yet), fall back to the first available type.
  useEffect(() => {
    if (sessionTypes.length === 0) return;
    if (!sessionTypes.some((t) => t.id === type)) {
      setType(sessionTypes[0].id);
    }
  }, [sessionTypes, type]);

  // Reset a stale filter if its type no longer exists.
  useEffect(() => {
    if (filter !== "all" && !sessionTypes.some((t) => t.id === filter)) {
      setFilter("all");
    }
  }, [sessionTypes, filter]);

  const submit = () => {
    if (!entry.trim()) {
      setEntryError("End-of-chat summary is required");
      return;
    }
    if (!type) {
      setEntryError("Add a session type first (Edit types).");
      return;
    }
    setEntryError("");
    addSession({ id: uid(), date: new Date().toISOString(), type, mood, entry: entry.trim(), win });
    setEntry(""); setWin(false);
  };

  const filtered = useMemo(
    () => filter === "all" ? state.sessions : state.sessions.filter((s) => s.type === filter),
    [state.sessions, filter]
  );

  // Types that actually appear in the filter row: any defined type with
  // sessions, PLUS any orphaned type ids present in history (so you can still
  // filter to a deleted type's past sessions).
  const filterableTypeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of state.sessions) ids.add(s.type);
    return Array.from(ids);
  }, [state.sessions]);

  return (
    <div>
      <SectionTitle emoji="📝" title="Session log" subtitle="Drop in your end-of-chat summary at the end of each builder session." />
      <div className="border rounded-lg p-5 mb-10" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <div className="flex items-center justify-between mb-1.5 h-5">
              <label className="block text-xs text-[var(--text-muted)]">Session type</label>
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors leading-none"
                title="Add, rename, recolor, reorder, or delete session types"
              >
                <IconSettings /> Edit types
              </button>
            </div>
            <select className="notion-input" value={type} onChange={(e) => setType(e.target.value as SessionType)} style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
              {sessionTypes.length === 0 ? (
                <option value="">No types — click Edit types</option>
              ) : (
                sessionTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 h-5 flex items-center">Mood / energy</label>
            <select className="notion-input" value={mood} onChange={(e) => setMood(e.target.value as Mood)} style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
              {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <label className="block text-xs text-[var(--text-muted)] mb-1.5">
          End-of-chat summary
          <span className="text-[var(--tag-coral-fg)] ml-0.5">*</span>
        </label>
        <textarea
          className="notion-input"
          rows={10}
          placeholder="Paste the structured end-of-chat summary here…"
          value={entry}
          onChange={(e) => {
            setEntry(e.target.value);
            if (entryError && e.target.value.trim()) setEntryError("");
          }}
          style={{
            background: "var(--bg)",
            borderColor: entryError ? "var(--tag-coral-fg)" : "var(--border-strong)",
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
          }}
        />
        {entryError && (
          <div className="text-xs mt-1" style={{ color: "var(--tag-coral-fg)" }}>
            {entryError}
          </div>
        )}
        <div className="flex items-center justify-between mt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={win} onChange={(e) => setWin(e.target.checked)} />
            <span>⭐ Mark as win</span>
          </label>
          <button className="btn btn-primary" onClick={submit}><IconPlus /> Add session</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs text-[var(--text-muted)] mr-1">Filter:</span>
        <button onClick={() => setFilter("all")} className="text-xs px-2.5 py-1 rounded-md border" style={{ borderColor: filter === "all" ? "var(--text)" : "var(--border)", background: filter === "all" ? "var(--text)" : "var(--bg)", color: filter === "all" ? "var(--bg)" : "var(--text)" }}>All ({state.sessions.length})</button>
        {filterableTypeIds.map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`transition-opacity ${filter !== "all" && filter !== t ? "opacity-50" : ""}`}><TypeTag type={t} types={sessionTypes} /></button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-faint)] py-10 text-center border rounded" style={{ borderColor: "var(--border)" }}>No sessions yet.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className="border rounded p-4 group hover:bg-[var(--bg-hover)]" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <TypeTag type={s.type} types={sessionTypes} />
                <span className="text-xs text-[var(--text-muted)]">{fmtShortDate(s.date)}</span>
                <span className="text-xs text-[var(--text-faint)]">· {s.mood}</span>
                {s.win && <span className="text-xs">⭐ Win</span>}
                <button className="icon-btn ml-auto opacity-0 group-hover:opacity-100" onClick={() => deleteSession(s.id)}><IconTrash /></button>
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words" style={{ fontFamily: "inherit" }}>{s.entry}</pre>
            </div>
          ))}
        </div>
      )}
      <SessionTypeManager open={manageOpen} onClose={() => setManageOpen(false)} app={app} />
    </div>
  );
}

function PhaseTracker({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update } = app;
  const week = currentPhaseWeek(state.phase.startDate);
  const done = state.phase.done.filter(Boolean).length;
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTasks, setDraftTasks] = useState<string[]>([]);

  // Refs to each week card so we can scroll the current one into view on mount.
  const weekRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll to the current week when the tab opens. We pick the first
  // not-yet-done week starting from currentPhaseWeek(); if everything up to
  // and including the current week is done, we fall back to the current week
  // index. If Phase 1 hasn't started or is fully complete, no scroll.
  useEffect(() => {
    if (week < 1 || week > 8) return;
    // Find the first week from `week` onwards that isn't done.
    let target = week - 1; // convert to 0-based index
    for (let i = week - 1; i < 8; i++) {
      if (!state.phase.done[i]) { target = i; break; }
    }
    const el = weekRefs.current[target];
    if (el) {
      // Defer to next tick so layout is settled before scrolling. We use
      // window.scrollTo with manual offset instead of scrollIntoView so the
      // sticky header (~88px) doesn't end up covering the top of the card.
      requestAnimationFrame(() => {
        const header = document.querySelector("header.sticky") as HTMLElement | null;
        const headerH = header ? header.getBoundingClientRect().height : 88;
        const rect = el.getBoundingClientRect();
        const top = window.scrollY + rect.top - headerH - 16; // 16px breathing room
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
      });
    }
    // We intentionally only run on mount — re-scrolling on every state change
    // would be jarring while the user is editing weeks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase grouping label per week (Foundation → Deepen → Apply → Ship)
  // Each phase uses one of the existing tag colors from index.css.
  const PHASE_GROUPS: { label: string; color: string }[] = [
    { label: "Foundation", color: "purple" },
    { label: "Foundation", color: "purple" },
    { label: "Deepen",     color: "blue" },
    { label: "Deepen",     color: "blue" },
    { label: "Apply",      color: "amber" },
    { label: "Apply",      color: "amber" },
    { label: "Ship",       color: "teal" },
    { label: "Ship",       color: "teal" },
  ];

  // Focus tag color mapping (matches the existing journal palette).
  type FocusKey = "Prompting" | "Building" | "Python" | "Ideas" | "Shipping";
  const FOCUS_COLOR: Record<FocusKey, string> = {
    Prompting: "amber",
    Building:  "blue",
    Python:    "purple",
    Ideas:     "teal",
    Shipping:  "green",
  };

  // Locked content for all 8 weeks. The `title` here is the editable display
  // title (saved under phase.customThemes when changed); everything else
  // is rendered from this static plan.
  interface WeekContent {
    title: string;
    focus: FocusKey[];
    tasks: string[];
    priority: { kind: "Priority" | "Reflection"; text: string };
    sunday: string;
    resources: { text: string; done?: boolean }[];
  }

  const WEEKS: WeekContent[] = [
    {
      title: "Foundation",
      focus: ["Prompting", "Building", "Python"],
      tasks: [
        "DeepLearning.AI prompt engineering course — completed",
        "Reddit automation built and live — collecting data",
        "CS50P — through Loops",
      ],
      priority: {
        kind: "Reflection",
        text: "Foundation laid. DeepLearning.AI gave the mental model; Reddit automation proved you can ship.",
      },
      sunday: "Reviewed Week 1. Ready for prompt engineering depth.",
      resources: [
        { text: "DeepLearning.AI", done: true },
        { text: "Make.com" },
        { text: "CS50P Loops" },
      ],
    },
    {
      title: "Prompt Engineering Depth + Python",
      focus: ["Prompting", "Python"],
      tasks: [
        "Work through the Anthropic interactive tutorial — don't just read, run the exercises",
        "Practice the core techniques hands-on: XML tags, chain-of-thought, few-shot, system prompts",
        "Build personal prompt library — 10 reusable prompts saved to GitHub",
        "CS50P — Exceptions + Libraries",
        "Let Reddit automation keep collecting data (review next week)",
      ],
      priority: {
        kind: "Priority",
        text: "Prompt library is the anchor. The tutorial teaches the techniques; the library is where you prove they landed.",
      },
      sunday: "Which prompt patterns clicked? Update GitHub.",
      resources: [
        { text: "Anthropic interactive tutorial (GitHub/Colab)" },
        { text: "Anthropic docs (reference)" },
        { text: "Prompt library on GitHub" },
        { text: "CS50P Exceptions + Libraries" },
      ],
    },
    {
      title: "Reddit Insights + Automation Brainstorm",
      focus: ["Ideas", "Python"],
      tasks: [
        "Review 2 weeks of Reddit data — what patterns, problems, or opportunities are showing up?",
        "Brainstorm automation #2 — use Reddit insights to decide what's worth building next",
        "End the week with a clear automation brief: what it does, why it's worth building, what you'll learn",
        "CS50P — Unit Tests + File I/O",
      ],
      priority: {
        kind: "Priority",
        text: "The automation brief. Leave Friday with a specific, decided idea — not vague possibilities.",
      },
      sunday: "What will automation #2 solve, and what will it teach you?",
      resources: [
        { text: "Reddit data review" },
        { text: "Ideas Log" },
        { text: "CS50P Unit Tests + File I/O" },
      ],
    },
    {
      title: "Build Automation #2",
      focus: ["Building", "Python"],
      tasks: [
        "Build automation #2 from Week 3's brief",
        "Make it genuinely useful — test with real inputs, not just functional",
        "Document as case study: problem → tool → solution → result",
        "CS50P — Regular Expressions",
      ],
      priority: {
        kind: "Priority",
        text: "Ship by Thursday so Friday is documentation and reflection. \"Shipped and imperfect\" beats \"polished and unfinished.\"",
      },
      sunday: "What did building this teach you that prompting alone didn't?",
      resources: [
        { text: "Make.com" },
        { text: "GitHub (case study)" },
        { text: "CS50P Regular Expressions" },
      ],
    },
    {
      title: "Business Problems + Client Thinking",
      focus: ["Ideas", "Building", "Python"],
      tasks: [
        "Identify 1 real Kathmandu business you could help",
        "Talk to someone there — an actual conversation, not online research",
        "Map their problem to an AI solution",
        "Start scoping a prototype",
        "CS50P — Object-Oriented Programming",
      ],
      priority: {
        kind: "Priority",
        text: "The real conversation. One 20-min chat is worth more than any amount of googling \"AI in Nepal.\"",
      },
      sunday: "Is this a problem AI can actually solve? Be honest with yourself.",
      resources: [
        { text: "Kathmandu business contact" },
        { text: "Ideas Log" },
        { text: "CS50P OOP" },
      ],
    },
    {
      title: "Build Business Prototype",
      focus: ["Building", "Shipping", "Python"],
      tasks: [
        "Build prototype for Week 5 business using Make.com + AI",
        "Get it demo-ready — walkable in 5 minutes for the business owner",
        "Polish the pitch — plain language, no jargon",
        "CS50P — Et Cetera (finish CS50P 🎉)",
      ],
      priority: {
        kind: "Priority",
        text: "Demo-ready by Friday. The prototype solves one specific thing clearly enough that they get it in 5 minutes.",
      },
      sunday: "Are you ready to talk to a real client? What's the one thing still missing?",
      resources: [
        { text: "Make.com + AI prototype" },
        { text: "Pitch script" },
        { text: "CS50P complete 🎉" },
      ],
    },
    {
      title: "Building with the Claude API",
      focus: ["Prompting", "Building", "Python"],
      tasks: [
        "Full focus on \"Building with the Claude API\" course (Anthropic Academy)",
        "Run every exercise — don't just watch. Code along.",
        "Pay special attention to: tool use, RAG, and MCP sections",
        "Reach out to Week 5 business — offer to show the prototype",
      ],
      priority: {
        kind: "Priority",
        text: "The course. This is the week you cross from using AI to building with it. Protect the time — it's the most important week of Phase 1.",
      },
      sunday: "What can you now build that you couldn't on Monday?",
      resources: [
        { text: "Building with the Claude API (Anthropic Academy)" },
        { text: "Anthropic API key" },
        { text: "Business outreach" },
      ],
    },
    {
      title: "Apply + Transition to Phase 2",
      focus: ["Building", "Shipping", "Python"],
      tasks: [
        "Scope + start Reddit Extractor — first Python script pulling posts by keyword via Reddit API",
        "Refine client prototype based on any feedback received",
        "Update context.md — full Phase 1 retrospective",
        "Set Phase 2 goals (built together with Claude)",
      ],
      priority: {
        kind: "Priority",
        text: "The context.md update — this becomes the brief for Phase 2 planning. Don't skip the retrospective.",
      },
      sunday: "Phase 1 done. What did you build? Who are you now vs Week 1?",
      resources: [
        { text: "Reddit Extractor (start)" },
        { text: "context.md update" },
        { text: "Phase 2 roadmap (to build)" },
      ],
    },
  ];

  const toggle = (i: number) => {
    const next = state.phase.done.slice();
    next[i] = !next[i];
    update("phase", { ...state.phase, done: next });
  };

  // Title (the week's display name) — read from customThemes if set,
  // otherwise the default from WEEKS above.
  const getTitle = (i: number): string => {
    const custom = state.phase.customThemes?.[i];
    return custom != null ? custom : WEEKS[i].title;
  };

  // Tasks for a week — read from customTasks if set, otherwise the default.
  const getTasks = (i: number): string[] => {
    const custom = state.phase.customTasks?.[i];
    return custom != null ? custom : WEEKS[i].tasks;
  };

  // True if either the title or the task list differs from defaults.
  const isCustomized = (i: number): boolean => {
    const customTitle = state.phase.customThemes?.[i];
    const titleEdited = customTitle != null && customTitle !== WEEKS[i].title;
    const customTasks = state.phase.customTasks?.[i];
    const tasksEdited = customTasks != null && (
      customTasks.length !== WEEKS[i].tasks.length ||
      customTasks.some((t, idx) => t !== WEEKS[i].tasks[idx])
    );
    return titleEdited || tasksEdited;
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setDraftTitle(getTitle(i));
    setDraftTasks(getTasks(i).slice()); // copy so edits don't mutate
  };

  const saveEdit = () => {
    if (editingIdx == null) return;

    // Save title: null if it matches the default or is empty after trim.
    const themes = (state.phase.customThemes ?? new Array(8).fill(null)).slice();
    const trimmedTitle = draftTitle.trim();
    themes[editingIdx] = trimmedTitle === WEEKS[editingIdx].title || trimmedTitle === ""
      ? null
      : trimmedTitle;

    // Save tasks: drop empties, then null if they match the defaults.
    const tasks = (state.phase.customTasks ?? new Array(8).fill(null)).slice();
    const cleanedTasks = draftTasks.map((t) => t.trim()).filter((t) => t.length > 0);
    const defaults = WEEKS[editingIdx].tasks;
    const matchesDefault =
      cleanedTasks.length === defaults.length &&
      cleanedTasks.every((t, idx) => t === defaults[idx]);
    tasks[editingIdx] = matchesDefault ? null : cleanedTasks;

    update("phase", { ...state.phase, customThemes: themes, customTasks: tasks });
    setEditingIdx(null);
    setDraftTitle("");
    setDraftTasks([]);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setDraftTitle("");
    setDraftTasks([]);
  };

  const resetToDefault = (i: number) => {
    const themes = (state.phase.customThemes ?? new Array(8).fill(null)).slice();
    const tasks = (state.phase.customTasks ?? new Array(8).fill(null)).slice();
    themes[i] = null;
    tasks[i] = null;
    update("phase", { ...state.phase, customThemes: themes, customTasks: tasks });
    if (editingIdx === i) {
      setEditingIdx(null);
      setDraftTitle("");
      setDraftTasks([]);
    }
  };

  // Helpers for the in-card task editor
  const updateDraftTask = (idx: number, value: string) => {
    setDraftTasks((prev) => prev.map((t, i) => (i === idx ? value : t)));
  };
  const addDraftTask = () => {
    setDraftTasks((prev) => [...prev, ""]);
  };
  const removeDraftTask = (idx: number) => {
    setDraftTasks((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <SectionTitle emoji="🗺️" title="Phase 1 tracker" subtitle="Eight weeks of foundation work. Click the circle to mark complete. Hover a card to edit its title and tasks." />
      <div className="border rounded p-4 mb-6 flex flex-wrap items-center gap-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Phase 1 start</div>
          <input
            type="date"
            className="notion-input"
            value={state.phase.startDate.slice(0, 10)}
            onChange={(e) => {
              if (!e.target.value) return; // ignore cleared input
              update("phase", { ...state.phase, startDate: new Date(e.target.value).toISOString() });
            }}
            onClick={(e) => {
              // Native date inputs only open the picker when the tiny calendar
              // icon is clicked. showPicker() opens it from clicking anywhere.
              const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
              if (typeof el.showPicker === "function") {
                try { el.showPicker(); } catch {}
              }
            }}
            style={{
              background: "var(--bg)",
              borderColor: "var(--border-strong)",
              cursor: "pointer",
              colorScheme: "light dark",
            }}
          />
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Current week</div>
          <div className="px-2 py-1">{week === 0 ? "Hasn't started" : week > 8 ? "Phase 1 complete" : `Week ${week}`}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">Progress</div>
          <div className="px-2 py-1">{done} / 8 weeks</div>
        </div>
      </div>

      <div className="space-y-3">
        {WEEKS.map((wk, i) => {
          // Done state is driven entirely by phase.done[] (user-controlled via
          // the circle toggle). "Current" is the first week from
          // currentPhaseWeek() that hasn't been marked done — so once a week
          // is checked off, the current highlight moves forward naturally.
          const isDone = !!state.phase.done[i];
          const isCurrent = i + 1 === week && !isDone;
          const isEditing = editingIdx === i;
          const customized = isCustomized(i);
          const currentTitle = getTitle(i);
          const group = PHASE_GROUPS[i];

          return (
            <div
              key={i}
              ref={(el) => { weekRefs.current[i] = el; }}
              className="group border rounded-lg p-5 transition-colors"
              style={{
                borderColor: isCurrent
                  ? "var(--pip-current)"
                  : isDone
                  ? "var(--pip-done)"
                  : "var(--border)",
                background: isCurrent
                  ? "color-mix(in oklab, var(--pip-current) 8%, var(--bg))"
                  : isDone
                  ? "color-mix(in oklab, var(--pip-done) 6%, var(--bg))"
                  : "var(--bg)",
              }}
            >
              {/* Header row: done-circle + badge + title + status tags + edit icon */}
              <div className="flex items-start gap-3 mb-3">
                <button
                  onClick={() => toggle(i)}
                  className="w-6 h-6 rounded shrink-0 flex items-center justify-center mt-0.5 cursor-pointer border-none"
                  style={{
                    background: isDone ? "var(--pip-done)" : isCurrent ? "var(--pip-current)" : "var(--pip-upcoming)",
                    color: "#fff",
                  }}
                  title={isDone ? "Mark as incomplete" : "Mark as complete"}
                >
                  {isDone && <IconCheck />}
                </button>

                <div className="flex-1 min-w-0">
                  {/* Badge row */}
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span
                      className="tag"
                      style={{
                        background: `var(--tag-${group.color}-bg)`,
                        color: `var(--tag-${group.color}-fg)`,
                      }}
                    >
                      Week {i + 1} · {group.label}
                    </span>
                    {isCurrent && (
                      <span className="tag" style={{ background: "var(--tag-amber-bg)", color: "var(--tag-amber-fg)" }}>
                        Current
                      </span>
                    )}
                    {isDone && (
                      <span className="tag" style={{ background: "var(--tag-green-bg)", color: "var(--tag-green-fg)" }}>
                        Done
                      </span>
                    )}
                    {customized && !isEditing && (
                      <span className="text-[10px] text-[var(--text-faint)]">edited</span>
                    )}
                  </div>

                  {/* Title — inline-editable */}
                  {isEditing ? (
                    <AutoTextarea
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      style={{ background: "var(--bg)", borderColor: "var(--border-strong)", fontWeight: 600, fontSize: 16 }}
                    />
                  ) : (
                    <h3
                      className="font-semibold text-base cursor-text leading-tight"
                      onClick={() => startEdit(i)}
                      title="Click to edit"
                    >
                      {currentTitle}
                    </h3>
                  )}
                </div>

                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 shrink-0">
                    <button className="icon-btn" onClick={() => startEdit(i)} title="Edit title and tasks">
                      <IconEdit />
                    </button>
                  </div>
                )}
              </div>

              {/* Focus tags */}
              <div className="flex flex-wrap gap-1.5 mb-3 ml-9">
                {wk.focus.map((f) => (
                  <span
                    key={f}
                    className="tag"
                    style={{
                      background: `var(--tag-${FOCUS_COLOR[f]}-bg)`,
                      color: `var(--tag-${FOCUS_COLOR[f]}-fg)`,
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>

              {/* Task list (view mode) OR task editor + action bar (edit mode) */}
              {isEditing ? (
                <div className="ml-9 mb-3">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Tasks</div>
                  <ul className="space-y-1.5">
                    {draftTasks.map((t, ti) => (
                      <li key={ti} className="flex gap-2 items-start">
                        <span className="text-[var(--text-faint)] shrink-0 mt-1.5">→</span>
                        <AutoTextarea
                          value={t}
                          onChange={(e) => updateDraftTask(ti, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          style={{ background: "var(--bg)", borderColor: "var(--border-strong)", fontSize: 14 }}
                        />
                        <button
                          className="icon-btn shrink-0"
                          onClick={() => removeDraftTask(ti)}
                          title="Remove task"
                        >
                          <IconTrash />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="btn mt-2"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={addDraftTask}
                  >
                    <IconPlus /> Add task
                  </button>

                  {/* Unified action bar — saves both title and tasks together */}
                  <div className="flex items-center gap-2 mt-3 pt-3 text-xs flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
                    <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={saveEdit}>Save</button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={cancelEdit}>Cancel</button>
                    {customized && (
                      <button
                        className="text-[var(--text-muted)] hover:text-[var(--text)] ml-1"
                        onClick={() => resetToDefault(i)}
                        title="Reset title and tasks to defaults"
                      >
                        Reset to default
                      </button>
                    )}
                    <span className="text-[var(--text-faint)] ml-auto">Esc to cancel · Shift+Enter for newline</span>
                  </div>
                </div>
              ) : (
                <ul className="ml-9 mb-3 space-y-1">
                  {getTasks(i).map((t, ti) => (
                    <li key={ti} className="text-sm flex gap-2" style={{ color: "var(--text)" }}>
                      <span className="text-[var(--text-faint)] shrink-0">→</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Priority / Reflection callout */}
              <div
                className="ml-9 mb-3 rounded-r"
                style={{
                  borderLeft: "3px solid var(--border-strong)",
                  background: "var(--bg-subtle)",
                  padding: "8px 12px",
                }}
              >
                <span className="text-sm">
                  <strong>{wk.priority.kind}:</strong> <span className="text-[var(--text-muted)]">{wk.priority.text}</span>
                </span>
              </div>

              {/* Sunday reflection prompt */}
              <div className="ml-9 mb-3 flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <span className="shrink-0" aria-hidden="true" style={{ fontSize: 13, lineHeight: 1.4 }}>↺</span>
                <span><strong className="text-[var(--text)]">Sunday:</strong> {wk.sunday}</span>
              </div>

              {/* Resource tags */}
              <div className="ml-9 flex flex-wrap gap-1.5">
                {wk.resources.map((r, ri) => (
                  <span
                    key={ri}
                    className="tag"
                    style={{
                      background: "var(--bg-subtle)",
                      color: r.done ? "var(--tag-green-fg)" : "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {r.text}{r.done ? " ✓" : ""}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PYTHON_LEVELS: PythonLevel[] = ["Beginner", "Beginner+", "Intermediate", "Intermediate+", "Advanced"];
const LEVEL_PCT: Record<PythonLevel, number> = { Beginner: 20, "Beginner+": 40, Intermediate: 60, "Intermediate+": 80, Advanced: 100 };

function PythonProgress({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update } = app;
  const p = state.python;
  const pct = LEVEL_PCT[p.level];
  const [knowText, setKnowText] = useState("");
  const [winText, setWinText] = useState("");
  return (
    <div>
      <SectionTitle emoji="🐍" title="Python progress" subtitle="Track what you know and the wins along the way." />
      <div className="border rounded-lg overflow-hidden mb-8" style={{ borderColor: "var(--border)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--text-faint)] mb-1">Current level</div>
          <div className="flex items-center gap-4">
            <select className="notion-input text-lg font-semibold" value={p.level} onChange={(e) => update("python", { ...p, level: e.target.value as PythonLevel })} style={{ width: "auto", padding: "2px 28px 2px 4px" }}>
              {PYTHON_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="flex items-center gap-1.5 ml-auto">
              {PYTHON_LEVELS.map((_, i) => <div key={i} className="h-2 w-10 rounded-sm" style={{ background: i < LEVEL_PCT[p.level] / 20 ? "var(--tag-purple-fg)" : "var(--pip-upcoming)" }} />)}
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-xs uppercase tracking-wide text-[var(--text-faint)] mb-1">Latest topic</div>
          <input className="notion-input text-base" value={p.topic} placeholder="What are you learning right now?" onChange={(e) => update("python", { ...p, topic: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { title: "What I know", emoji: "🧠", items: p.knows, color: "purple", onAdd: (t: string) => update("python", { ...p, knows: [...p.knows, { id: uid(), text: t }] }), onDel: (id: string) => update("python", { ...p, knows: p.knows.filter((k) => k.id !== id) }), text: knowText, setText: setKnowText },
          { title: "Recent wins", emoji: "⭐", items: p.wins, color: "green", onAdd: (t: string) => update("python", { ...p, wins: [...p.wins, { id: uid(), text: t }] }), onDel: (id: string) => update("python", { ...p, wins: p.wins.filter((w) => w.id !== id) }), text: winText, setText: setWinText },
        ].map(({ title, emoji, items, color, onAdd, onDel, text, setText }) => (
          <div key={title} className="border rounded-lg overflow-hidden flex flex-col" style={{ borderColor: "var(--border)" }}>
            <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "var(--border)", background: `var(--tag-${color}-bg)` }}>
              <div className="flex items-center gap-2"><span>{emoji}</span><span className="text-sm font-semibold" style={{ color: `var(--tag-${color}-fg)` }}>{title}</span></div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>{items.length}</span>
            </div>
            <div className="flex-1 px-1 py-1">
              {items.length === 0 ? <div className="text-sm text-[var(--text-faint)] text-center py-6">Nothing here yet.</div> : (
                <ul>{items.map((item, idx) => (
                  <li key={item.id} className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-[var(--bg-hover)]">
                    <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-medium shrink-0" style={{ background: `var(--tag-${color}-bg)`, color: `var(--tag-${color}-fg)` }}>{idx + 1}</span>
                    <span className="text-sm flex-1 min-w-0">{item.text}</span>
                    <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={() => onDel(item.id)}><IconTrash /></button>
                  </li>
                ))}</ul>
              )}
            </div>
            <div className="px-3 py-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
              <input className="notion-input flex-1 text-sm" placeholder="Add an item…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }} style={{ borderColor: "var(--border-strong)", background: "var(--bg)" }} />
              <button className="btn text-sm" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(""); } }} style={{ color: `var(--tag-${color}-fg)` }}><IconPlus /> Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StuckItems({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update, addSession } = app;
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    update("blockers", [{ id: uid(), text: text.trim(), added: new Date().toISOString() }, ...state.blockers]);
    setText("");
  };
  const del = (id: string) => update("blockers", state.blockers.filter((b) => b.id !== id));
  const resolve = (id: string) => {
    const b = state.blockers.find((b) => b.id === id);
    if (!b) return;
    addSession({ id: uid(), date: new Date().toISOString(), type: "reflection", mood: "Breakthrough", entry: `**Resolved blocker:** ${b.text}\n\n(Added ${fmtDate(b.added)})`, win: true });
    del(id);
  };
  return (
    <div>
      <SectionTitle emoji="🚧" title="Stuck items" subtitle="Open blockers and unanswered questions. Resolving one auto-creates a win." />
      <div className="flex items-start gap-2 mb-6">
        <AutoTextarea
          className="notion-input"
          placeholder="Add a blocker or open question… (Shift+Enter for new line)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}
        />
        <button className="btn btn-primary self-start" onClick={add}><IconPlus /> Add</button>
      </div>
      {state.blockers.length === 0 ? (
        <div className="text-sm text-[var(--text-faint)] py-10 text-center border rounded" style={{ borderColor: "var(--border)" }}>Nothing's blocking you right now. ✨</div>
      ) : (
        <ul className="border rounded divide-y" style={{ borderColor: "var(--border)" }}>
          {state.blockers.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-[var(--bg-hover)]">
              <span className="flex-1 text-sm whitespace-pre-wrap">{b.text}</span>
              <span className="text-xs text-[var(--text-faint)] tabular-nums shrink-0">{fmtDate(b.added)}</span>
              <button className="btn" onClick={() => resolve(b.id)}><IconCheck /> Resolved</button>
              <button className="icon-btn opacity-0 group-hover:opacity-100" onClick={() => del(b.id)}><IconTrash /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Wins({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state } = app;
  const wins = state.sessions.filter((s) => s.win || s.mood === "Breakthrough").slice().sort((a, b) => +new Date(b.date) - +new Date(a.date));
  return (
    <div>
      <SectionTitle emoji="🏆" title="Wins wall" subtitle="Auto-aggregated from sessions marked as wins or with a Breakthrough mood." />
      {wins.length === 0 ? (
        <div className="text-sm text-[var(--text-faint)] py-10 text-center border rounded" style={{ borderColor: "var(--border)" }}>No wins yet — keep building.</div>
      ) : (
        <div className="space-y-3">
          {wins.map((s) => (
            <div key={s.id} className="border rounded-lg p-4" style={{ borderColor: "var(--teal-accent-border)", background: "var(--teal-accent-bg)", color: "var(--teal-accent-fg)" }}>
              <div className="flex items-center gap-2 mb-2">
                <span>⭐</span><TypeTag type={s.type} types={state.sessionTypes} /><span className="text-xs opacity-80">{fmtDate(s.date)}</span>
                <span className="text-xs opacity-70">· {s.mood}</span>
              </div>
              <pre className="text-sm whitespace-pre-wrap break-words" style={{ fontFamily: "inherit" }}>{s.entry}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EXPORT_PROMPT = `[Add a short concise title of the summary here]
Session type: [automation | prompt engineering | use case | brainstorm | reflection | other]
What moved forward:
* [Key insight, skill, or thing I can now do that I couldn't before]
* [Anything concrete that progressed]
What I built or shipped (if anything):
* [Automation, prompt, script, prototype — name it specifically]
What I'm still unclear about:
* [Blockers or open questions]
Next concrete step:
* [One specific thing to do/learn/research next]
Journal updates to make:
* Python progress: [Did I level up? Move something from "stuck" to "know"? Or N/A]
* Ideas log: [New idea? Status change on existing? Or N/A]
* Reflection: [Mood shift, breakthrough, or N/A]
* Phase 1 tracker: [Which week am I in? Did I complete any milestones?]
* Roadmap: [Adjustments to May/June/July plans? Or N/A]
One-line session history entry:
* [Today's date] — [single sentence describing what I did]`;

function Prompt() {
  const DEFAULT_PROMPT = EXPORT_PROMPT;
  const [data, setData] = useState<{ text: string; lastUpdated: string | null }>({
    text: DEFAULT_PROMPT,
    lastUpdated: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Load saved prompt from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await loadKey<{ text: string; lastUpdated: string | null }>("prompt", {
          text: DEFAULT_PROMPT,
          lastUpdated: null,
        });
        setData(stored);
      } catch {
        // fall back to defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (next: { text: string; lastUpdated: string | null }) => {
    setData(next);
    try {
      await saveKey("prompt", next);
    } catch {}
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(data.text); }
    catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startEdit = () => {
    setDraft(data.text);
    setEditing(true);
    setConfirmReset(false);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
    setConfirmReset(false);
  };
  const saveEdit = () => {
    const text = draft.trim() ? draft : DEFAULT_PROMPT;
    persist({ text, lastUpdated: new Date().toISOString() });
    setEditing(false);
    setDraft("");
    setConfirmReset(false);
  };
  const resetToDefault = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    persist({ text: DEFAULT_PROMPT, lastUpdated: null });
    setEditing(false);
    setDraft("");
    setConfirmReset(false);
  };

  return (
    <div>
      <SectionTitle emoji="✨" title="End-of-chat prompt" subtitle="Paste this at the end of any builder chat to get a journal-ready summary." />

      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-xs text-[var(--text-faint)]">
          {data.lastUpdated ? `Last edited ${fmtShortDate(data.lastUpdated)}` : "Default prompt · not yet edited"}
        </span>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <button className="btn" onClick={startEdit}><IconEdit /> Edit</button>
              <button className="btn btn-primary" onClick={copy}><IconCopy /> {copied ? "Copied!" : "Copy prompt"}</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="border rounded-lg p-4" style={{ borderColor: "var(--border-strong)", background: "var(--bg-subtle)" }}>
          <AutoTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            minRows={14}
            style={{
              background: "var(--bg)",
              borderColor: "var(--border-strong)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.55,
            }}
          />
          <p className="text-[10px] text-[var(--text-faint)] mt-2">
            Tip: Empty saves revert to the default. Shift+Enter for new lines.
          </p>
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <button className="btn btn-danger" onClick={resetToDefault}>
              {confirmReset ? "Click again to confirm reset" : "Reset to default"}
            </button>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={cancelEdit}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      ) : (
        <pre
          className="border rounded-lg p-5 text-sm whitespace-pre-wrap break-words"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-subtle)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            lineHeight: 1.55,
          }}
        >
          {loaded ? data.text : DEFAULT_PROMPT}
        </pre>
      )}
    </div>
  );
}

function buildMarkdown(state: ReturnType<typeof useAppState>["state"]): string {
  const lines: string[] = [];
  const d = new Date().toLocaleDateString();
  lines.push("# AI Builder's Journal — context.md", "", `_Generated ${d}_`, "");
  lines.push("## Current focus", state.focus || "_(none)_", "");
  lines.push("## Reflection");
  lines.push(`- **Feeling:** ${state.reflection.feeling || "—"}`);
  lines.push(`- **Challenge:** ${state.reflection.challenge || "—"}`);
  lines.push(`- **Breakthrough:** ${state.reflection.breakthrough || "—"}`);
  lines.push(`- **Next focus:** ${state.reflection.next || "—"}`, "");

  // Reflection log
  if (state.reflectionLog.length > 0) {
    lines.push("## Past reflections");
    state.reflectionLog.slice(0, 8).forEach((r) => {
      const start = new Date(r.weekStart);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      lines.push(`### Week of ${fmtShortDate(start.toISOString())} – ${fmtShortDate(end.toISOString())}`);
      r.feeling && lines.push(`- **Feeling:** ${r.feeling}`);
      r.challenge && lines.push(`- **Challenge:** ${r.challenge}`);
      r.breakthrough && lines.push(`- **Breakthrough:** ${r.breakthrough}`);
      r.next && lines.push(`- **Next focus:** ${r.next}`);
      lines.push("");
    });
  }

  lines.push("## Python progress");
  lines.push(`- **Level:** ${state.python.level}`);
  lines.push(`- **Latest topic:** ${state.python.topic}`, "");
  lines.push("### What I know");
  state.python.knows.forEach((k) => lines.push(`- ${k.text}`));
  state.python.knows.length === 0 && lines.push("_(empty)_");
  lines.push("", "### Recent wins");
  state.python.wins.forEach((w) => lines.push(`- ${w.text}`));
  state.python.wins.length === 0 && lines.push("_(empty)_");
  lines.push("");

  lines.push("## Phase 1 tracker");
  const wk = currentPhaseWeek(state.phase.startDate);
  lines.push(`- **Phase 1 start:** ${fmtDate(state.phase.startDate)}`);
  lines.push(`- **Current week:** ${wk === 0 ? "not started" : wk > 8 ? "complete" : `Week ${wk}`}`);
  lines.push(`- **Progress:** ${state.phase.done.filter(Boolean).length}/8`, "");
  PHASE_WEEKS.forEach((pw, i) => {
    const mark = state.phase.done[i] ? "x" : " ";
    const cur = i + 1 === wk ? " _(current)_" : "";
    const customTheme = state.phase.customThemes?.[i];
    const theme = customTheme != null ? customTheme : pw.theme;
    lines.push(`- [${mark}] **${pw.title}**${cur} — ${theme}`);
  });
  lines.push("");

  lines.push("## Ideas log");
  state.ideas.length === 0 && lines.push("_(none)_");
  state.ideas.forEach((idea) => {
    lines.push(`### ${idea.title} _(${idea.status})_`);
    idea.why && lines.push(`- **Why:** ${idea.why}`);
    idea.next && lines.push(`- **Next step:** ${idea.next}`);
    idea.deps && lines.push(`- **Dependencies:** ${idea.deps}`);
    lines.push("");
  });

  lines.push("## Stuck items");
  state.blockers.length === 0 && lines.push("_(none)_");
  state.blockers.forEach((b) => lines.push(`- ${b.text} _(added ${fmtDate(b.added)})_`));
  lines.push("");

  const wins = state.sessions.filter((s) => s.win || s.mood === "Breakthrough");
  lines.push("## Wins");
  wins.length === 0 && lines.push("_(none yet)_");
  wins.forEach((s) => {
    const preview = (s.entry.split("\n").find((l) => l.trim()) ?? "").replace(/^\*+|\*+$/g, "").replace(/^[-#>\s]+/, "").trim().slice(0, 200);
    lines.push(`- **${fmtDate(s.date)}** [${sessionTypeLabel(state.sessionTypes, s.type)}] — ${preview}`);
  });
  lines.push("");

  lines.push("## Session history");
  state.sessions.length === 0 && lines.push("_(no sessions)_");
  state.sessions.forEach((s) => {
    lines.push("", `### ${fmtDate(s.date)} — ${sessionTypeLabel(state.sessionTypes, s.type)} _(${s.mood})_${s.win ? " ⭐" : ""}`, "", s.entry);
  });

  return lines.join("\n");
}

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}

function Export({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, resetAll } = app;
  const [confirmStep, setConfirmStep] = useState(0);
  const [toast, setToast] = useState("");
  // Import state
  const [importPreview, setImportPreview] = useState<{
    json: string;
    summary: { key: string; count: string }[];
  } | null>(null);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const md = buildMarkdown(state);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const copyMd = async () => {
    try { await navigator.clipboard.writeText(md); showToast("✓ Copied markdown to clipboard"); }
    catch { showToast("Copy failed — try the download button instead"); }
  };

  const doReset = () => {
    if (confirmStep === 0) { setConfirmStep(1); return; }
    if (confirmStep === 1) { setConfirmStep(2); return; }
    resetAll(); setConfirmStep(0); showToast("✓ All data reset to seed");
  };

  // ── Import handlers ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError("");
    const file = e.target.files?.[0];
    // Reset the input so the same file can be selected again after cancel
    if (e.target) e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      // Parse and validate to build a preview
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setImportError("File is not a journal backup (expected a JSON object).");
          return;
        }
        const summary: { key: string; count: string }[] = [];
        const fmtCount = (k: string, v: unknown): string => {
          if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
          if (typeof v === "string") return v.trim() ? "set" : "empty";
          if (typeof v === "object" && v !== null) return "set";
          return String(v);
        };
        const orderedKeys = ["sessions", "ideas", "blockers", "reflection", "reflectionLog", "notes", "todos", "python", "phase", "focus", "prompt", "theme"];
        for (const k of orderedKeys) {
          if (k in parsed) summary.push({ key: k, count: fmtCount(k, parsed[k]) });
        }
        if (summary.length === 0) {
          setImportError("This file doesn't appear to contain any journal data.");
          return;
        }
        setImportPreview({ json: text, summary });
      } catch {
        setImportError("Couldn't read this file — it's not valid JSON.");
      }
    };
    reader.onerror = () => setImportError("Couldn't read this file.");
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!importPreview) return;
    const result: ImportResult = await importAllData(importPreview.json);
    if (result.ok) {
      // Reload so all hooks re-init with the new data.
      // This is simpler and safer than trying to update every piece of state manually.
      window.location.reload();
    } else {
      setImportError(result.error);
      setImportPreview(null);
    }
  };

  const cancelImport = () => {
    setImportPreview(null);
    setImportError("");
  };

  return (
    <div>
      <SectionTitle emoji="📤" title="Export" subtitle="Generate clean markdown context, back up to JSON, or start fresh." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <button className="btn btn-primary justify-center py-3" onClick={copyMd}><IconCopy /> Copy markdown</button>
        <button className="btn justify-center py-3" onClick={() => download(md, "context.md", "text/markdown;charset=utf-8")}>⬇ Download context.md</button>
        <button className="btn justify-center py-3" onClick={() => download(JSON.stringify(state, null, 2), "journey-backup.json", "application/json;charset=utf-8")}>⬇ Download JSON backup</button>
      </div>

      {/* Import JSON backup */}
      <div className="border rounded p-4 mb-8" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-semibold mb-1">Import JSON backup</h3>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          Restore from a previously-downloaded backup. <strong>This will overwrite all current data</strong> — download a backup first if you want to keep what's here.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {importError && (
          <div className="mb-3 border rounded p-3 text-sm" style={{ borderColor: "var(--tag-coral-fg)", background: "var(--tag-coral-bg)", color: "var(--tag-coral-fg)" }}>
            {importError}
          </div>
        )}

        {importPreview ? (
          <div className="border rounded-lg p-4 mb-3" style={{ borderColor: "var(--border-strong)", background: "var(--bg-subtle)" }}>
            <p className="text-sm font-semibold mb-2">Ready to import:</p>
            <ul className="text-xs text-[var(--text-muted)] space-y-1 mb-3 pl-4">
              {importPreview.summary.map(({ key, count }) => (
                <li key={key} className="list-disc">
                  <span className="text-[var(--text)] font-medium">{key}</span>: {count}
                </li>
              ))}
            </ul>
            <p className="text-xs mb-3" style={{ color: "var(--tag-coral-fg)" }}>
              ⚠️ This will replace your current data and reload the app.
            </p>
            <div className="flex gap-2">
              <button className="btn" onClick={cancelImport}>Cancel</button>
              <button className="btn btn-primary" onClick={doImport}>Confirm import</button>
            </div>
          </div>
        ) : (
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            Choose JSON file…
          </button>
        )}
      </div>

      <div className="border rounded p-4 mb-8" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div className="text-xs text-[var(--text-muted)] mb-2">Preview</div>
        <pre className="text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto" style={{ fontFamily: "ui-monospace, monospace", color: "var(--text)" }}>{md}</pre>
      </div>
      <div className="border rounded p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-semibold mb-1">Reset all data</h3>
        <p className="text-sm text-[var(--text-muted)] mb-3">Wipes every <code>journey:*</code> key and restores the seed. This can't be undone.</p>
        
        {/* Confirmation popup */}
        {confirmStep > 0 && (
          <div className="mb-3 border rounded-lg p-4" style={{ borderColor: "var(--tag-coral-fg)", background: "var(--tag-coral-bg)" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--tag-coral-fg)" }}>
              {confirmStep === 1 ? "⚠️ Are you sure? This will delete ALL your journal data." : "🚨 Last warning — this cannot be undone!"}
            </p>
            <p className="text-xs mb-3" style={{ color: "var(--tag-coral-fg)" }}>
              {confirmStep === 1
                ? "All sessions, ideas, reflections, notes, to-dos, and progress will be permanently erased."
                : "Click the button below one final time to confirm the reset."}
            </p>
            <div className="flex gap-2">
              <button className="btn" onClick={() => setConfirmStep(0)}>Cancel</button>
              <button className="btn btn-danger" onClick={doReset}>
                {confirmStep === 1 ? "Yes, I'm sure — reset" : "Confirm reset — erase everything"}
              </button>
            </div>
          </div>
        )}

        {confirmStep === 0 && (
          <button className="btn btn-danger" onClick={doReset}>Reset all data</button>
        )}
      </div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-sm z-50" style={{ background: "var(--text)", color: "var(--bg)" }}>{toast}</div>
      )}
    </div>
  );
}

function Stats({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state } = app;
  const { sessions, ideas, blockers, python } = state;
  const byType = new Map<SessionType, number>();
  sessions.forEach((s) => byType.set(s.type, (byType.get(s.type) || 0) + 1));
  const byMood = new Map<Mood, number>();
  sessions.forEach((s) => byMood.set(s.mood, (byMood.get(s.mood) || 0) + 1));
  const wins = sessions.filter((s) => s.win || s.mood === "Breakthrough");
  const winRate = sessions.length > 0 ? Math.round(wins.length / sessions.length * 100) : 0;
  const byStatus = new Map<IdeaStatus, number>();
  ideas.forEach((i) => byStatus.set(i.status, (byStatus.get(i.status) || 0) + 1));
  const pct = { Beginner: 20, "Beginner+": 40, Intermediate: 60, "Intermediate+": 80, Advanced: 100 }[python.level] ?? 20;

  const weeks: { label: string; count: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const end = new Date(); end.setDate(end.getDate() - i * 7); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, count: sessions.filter((s) => { const d = new Date(s.date); return d >= start && d <= end; }).length });
  }
  const maxW = Math.max(1, ...weeks.map((w) => w.count));

  const firstDate = sessions.length > 0 ? new Date(sessions[sessions.length - 1].date) : new Date();
  const daysSince = Math.max(1, Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  return (
    <div>
      <SectionTitle emoji="📊" title="Stats & insights" subtitle="A bird's-eye view of your builder's journey." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[["Total sessions", sessions.length, "var(--accent)"], [`Win rate`, `${winRate}%`, "var(--pip-done)"], ["Active ideas", ideas.length, "var(--tag-coral-fg)"], ["Blockers", blockers.length, blockers.length > 0 ? "var(--tag-amber-fg)" : "var(--text-muted)"]].map(([label, value, color]) => (
          <div key={label as string} className="border rounded-lg p-4 text-center" style={{ borderColor: "var(--border)" }}>
            <div className="text-2xl font-bold mb-1" style={{ color: color as string }}>{value as string | number}</div>
            <div className="text-xs text-[var(--text-muted)]">{label as string}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border rounded-lg p-5" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4">Session types</h3>
          {byType.size === 0 ? <p className="text-sm text-[var(--text-faint)]">No sessions yet.</p> : (
            <div className="space-y-3">
              {Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).map(([t, cnt]) => {
                const pct = sessions.length > 0 ? cnt / sessions.length * 100 : 0;
                return (
                  <div key={t}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{sessionTypeLabel(state.sessionTypes, t)}</span>
                      <span className="text-[var(--text-muted)]">{cnt} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-2 rounded-sm" style={{ background: "var(--bg-hover)" }}>
                      <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: "var(--accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="border rounded-lg p-5" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4">Mood distribution</h3>
          {byMood.size === 0 ? <p className="text-sm text-[var(--text-faint)]">No sessions yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {Array.from(byMood.entries()).sort((a, b) => b[1] - a[1]).map(([m, cnt]) => (
                <div key={m} className="px-3 py-2 rounded-lg text-sm text-center" style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
                  <div className="font-semibold">{cnt}</div>
                  <div className="text-xs text-[var(--text-muted)]">{m}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="border rounded-lg p-5" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4">Weekly activity</h3>
          <div className="flex items-end gap-3 h-32">
            {weeks.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-muted)]">{w.count}</span>
                <div className="w-full rounded-t-sm" style={{ height: `${w.count / maxW * 100}%`, minHeight: w.count > 0 ? "8px" : "2px", background: w.count > 0 ? "var(--accent)" : "var(--bg-hover)" }} />
                <span className="text-[10px] text-[var(--text-faint)]">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border rounded-lg p-5" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4">Python progress</h3>
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">{python.level}</span>
              <span className="text-[var(--text-muted)]">{pct}%</span>
            </div>
            <div className="h-3 rounded-sm" style={{ background: "var(--bg-hover)" }}>
              <div className="h-full rounded-sm" style={{ width: `${pct}%`, background: "var(--tag-purple-fg)" }} />
            </div>
          </div>
          <h4 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Ideas by status</h4>
          {byStatus.size === 0 ? <p className="text-sm text-[var(--text-faint)]">No ideas yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {Array.from(byStatus.entries()).map(([s, cnt]) => (
                <span key={s} className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-subtle)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>{s}: {cnt}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border rounded-lg p-4 text-sm text-[var(--text-muted)]" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>📅 Active for <strong className="text-[var(--text)]">{daysSince} day{daysSince !== 1 ? "s" : ""}</strong></span>
          <span>📚 Know <strong className="text-[var(--text)]">{python.knows.length}</strong> concepts</span>
          <span>⭐ <strong className="text-[var(--text)]">{python.wins.length}</strong> wins logged</span>
          <span>🎯 Focus: <strong className="text-[var(--text)]">{state.focus}</strong></span>
        </div>
      </div>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard", label: "Dashboard", emoji: "🏠" },
  { id: "session", label: "Session log", emoji: "📝" },
  { id: "phase", label: "Phase 1", emoji: "🗺️" },
  { id: "python", label: "Python", emoji: "🐍" },
  { id: "ideas", label: "Ideas", emoji: "💡" },
  { id: "stuck", label: "Stuck", emoji: "🚧" },
  { id: "wins", label: "Wins", emoji: "🏆" },
  { id: "reflect", label: "Reflect", emoji: "🪞" },
  { id: "stats", label: "Stats", emoji: "📊" },
  { id: "export", label: "Export", emoji: "📤" },
  { id: "prompt", label: "Prompt", emoji: "✨" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Help Modal ─────────────────────────────────────────────────────────────
function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Help & guide">
      <div className="space-y-6 text-sm text-[var(--text-muted)]">
        <div>
          <div className="text-6xl mb-3 leading-none">📓</div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text)] mb-1">Builder's Journal</h2>
          <p className="text-xs">Your personal log for the AI builder's journey.</p>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[var(--text)] mb-2">How to use this app</h3>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li><strong>Dashboard</strong> — Your at-a-glance overview with focus, sessions, ideas, blockers, Phase 1 progress, 7-day streak, plus quick Notes & To-Dos.</li>
            <li><strong>Session log</strong> — Add end-of-chat summaries with type, mood, and content. Filter by type.</li>
            <li><strong>Phase 1</strong> — 8-week checklist. Tap weeks to mark complete. Current week highlighted in amber.</li>
            <li><strong>Python</strong> — Track your level, latest topic, what you know, and wins.</li>
            <li><strong>Ideas</strong> — Add ideas with title, why, next steps, dependencies, and status. Archive when done.</li>
            <li><strong>Stuck</strong> — Log blockers. Resolve one to auto-create a win session.</li>
            <li><strong>Wins</strong> — Auto-aggregated from marked wins and Breakthrough moods.</li>
            <li><strong>Reflect</strong> — Four weekly reflection prompts plus a week-grouped session view. Past reflections lock when the week ends.</li>
            <li><strong>Stats</strong> — Visual breakdown of session types, moods, weekly activity, and progress.</li>
            <li><strong>Export</strong> — Copy markdown, download .md or JSON backup, reset all data.</li>
            <li><strong>Prompt</strong> — The end-of-chat journal prompt. Editable with timestamp.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[var(--text)] mb-2">Tips</h3>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li><strong>Shift+Enter</strong> in any text field adds a new line.</li>
            <li><strong>Enter</strong> in to-do and blocker inputs submits the item.</li>
            <li>Text fields grow automatically as you type — no scrolling inside small boxes.</li>
            <li>Hover over a session or idea card to see the delete button.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[var(--text)] mb-2">Deploy for personal use</h3>
          <div className="space-y-3">
            <div className="border rounded-lg p-4" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <h4 className="font-semibold mb-1 text-[var(--text)]">Option 1: GitHub Pages (free)</h4>
              <ol className="list-decimal list-inside space-y-1 pl-2 text-xs">
                <li>Create a GitHub repo</li>
                <li>Upload the built <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg)" }}>index.html</code></li>
                <li>Go to Settings → Pages → Deploy from main branch</li>
                <li>Your app is live at <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg)" }}>username.github.io/repo</code></li>
              </ol>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <h4 className="font-semibold mb-1 text-[var(--text)]">Option 2: Vercel / Netlify (free)</h4>
              <ol className="list-decimal list-inside space-y-1 pl-2 text-xs">
                <li>Push code to GitHub</li>
                <li>Connect repo to Vercel or Netlify</li>
                <li>Set build command: <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg)" }}>npm run build</code></li>
                <li>Set output directory: <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg)" }}>dist</code></li>
                <li>Deploy — your app is live instantly</li>
              </ol>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <h4 className="font-semibold mb-1 text-[var(--text)]">Option 3: Use locally</h4>
              <p className="text-xs">Just open <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg)" }}>index.html</code> in your browser. All data persists in your browser's IndexedDB/localStorage.</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-base font-semibold text-[var(--text)] mb-2">Data persistence</h3>
          <p className="text-xs">All data is stored locally in your browser using <strong>IndexedDB</strong> (primary) with <strong>localStorage</strong> fallback. Your data persists across sessions and browser restarts. Use the Export tab to download JSON backups and restore them via "Import JSON backup".</p>
        </div>
      </div>
    </Modal>
  );
}

function App() {
  const app = useAppState();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<TabId>("dashboard");
  const [helpOpen, setHelpOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [migrateState, setMigrateState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [migrateMsg, setMigrateMsg] = useState("");

  useEffect(() => { initStorage(); }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const status = (e as CustomEvent<SyncStatus>).detail;
      setSyncStatus(status);
      if (status === "saved") setTimeout(() => setSyncStatus("idle"), 2000);
    };
    window.addEventListener("journal:sync", handler);
    return () => window.removeEventListener("journal:sync", handler);
  }, []);

  const runMigration = async () => {
    setMigrateState("running");
    try {
      const { migrated, keys } = await migrateLocalToSupabase();
      setMigrateMsg(migrated === 0
        ? "No local data found — already synced or fresh start."
        : `✅ Migrated ${migrated} key${migrated > 1 ? "s" : ""}: ${keys.join(", ")}`
      );
      setMigrateState("done");
    } catch {
      setMigrateMsg("❌ Migration failed. Check connection and try again.");
      setMigrateState("error");
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <header className="sticky top-0 z-10 border-b" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>📓</span><span>Builder's Journal</span>
              <span
                title={syncStatus === "saving" ? "Saving…" : syncStatus === "saved" ? "Saved" : syncStatus === "error" ? "Sync error" : ""}
                style={{
                  display: syncStatus === "idle" ? "none" : "inline-block",
                  width: 8, height: 8, borderRadius: "50%",
                  background: syncStatus === "saving" ? "#f59e0b" : syncStatus === "saved" ? "#22c55e" : "#ef4444",
                }}
              />
            </div>
            <div className="flex items-center gap-1">
              <button className="icon-btn" onClick={() => setHelpOpen(true)} title="Help & guide" aria-label="Help">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </button>
              <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
                {theme === "dark" ? <IconSun /> : <IconMoon />}
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="px-3 py-2 text-sm whitespace-nowrap relative" style={{ color: active ? "var(--text)" : "var(--text-muted)", borderBottom: active ? "2px solid var(--text)" : "2px solid transparent", fontWeight: active ? 600 : 400 }}>
                  <span className="mr-1.5">{t.emoji}</span>{t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {tab === "dashboard" && <Dashboard app={app} onNav={(t) => setTab(t as TabId)} />}
        {tab === "session" && <SessionLog app={app} />}
        {tab === "phase" && <PhaseTracker app={app} />}
        {tab === "python" && <PythonProgress app={app} />}
        {tab === "ideas" && <Ideas app={app} />}
        {tab === "stuck" && <StuckItems app={app} />}
        {tab === "wins" && <Wins app={app} />}
        {tab === "reflect" && <Reflect app={app} />}
        {tab === "stats" && <Stats app={app} />}
        {tab === "export" && (
          <>
            <div className="border rounded-lg p-5 mb-8" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <h3 className="font-semibold mb-1">☁️ Migrate local data to Supabase</h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                If you had data before Supabase was added, click below to migrate it. Safe to run multiple times — only copies keys not yet in Supabase.
              </p>
              <button
                className="btn btn-primary"
                onClick={runMigration}
                disabled={migrateState === "running"}
              >
                {migrateState === "running" ? "Migrating…" : "Migrate local data → Supabase"}
              </button>
              {migrateMsg && (
                <p className="text-sm mt-3" style={{ color: migrateState === "error" ? "var(--tag-coral-fg)" : "var(--text)" }}>
                  {migrateMsg}
                </p>
              )}
            </div>
            <Export app={app} />
          </>
        )}
        {tab === "prompt" && <Prompt />}
      </main>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
