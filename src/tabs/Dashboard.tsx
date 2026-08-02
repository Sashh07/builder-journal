import { useState } from "react";
import type { useAppState } from "../state";
import { currentPhaseWeek, currentPhase2Week, sessionsLastNDays, sessionsThisWeek, startOfWeek } from "../state";
import { PropertyRow, SessionDetailModal, TypeTag, fmtShortDate, todayLong as _today, AutoTextarea } from "../ui";
import { PHASE_WEEKS, type Session } from "../types";
import NotesModal from "./NotesModal";

export default function Dashboard({
  app,
  onNav,
}: {
  app: ReturnType<typeof useAppState>;
  onNav: (t: string) => void;
}) {
  const { state, update } = app;
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesTab, setNotesTab] = useState<"notes" | "todos">("notes");
  const week = currentPhaseWeek(state.phase.startDate);
  const p2Week = currentPhase2Week(state.phase2.startDate);
  const thisWeekMetric = state.weeklyMetrics.find(
    (m) => m.weekStart.slice(0, 10) === startOfWeek(new Date()).toISOString().slice(0, 10)
  );
  const thisWeek = sessionsThisWeek(state.sessions);
  const last7 = sessionsLastNDays(state.sessions, 7);
  const activeIdeas = state.ideas.filter((i) => i.status === "Active" || i.status === "Researching");
  const blockerCount = state.blockers.length;
  const recent = state.sessions.slice(0, 6);

  // streak: contiguous days with at least one session ending today
  let streak = 0;
  const dayHas = new Set(state.sessions.map((s) => new Date(s.date).toDateString()));
  const cursor = new Date();
  for (let i = 0; i < 30; i++) {
    if (dayHas.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // 7-day streak bar (last 7 days, oldest -> today)
  const days7: { label: string; has: boolean }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days7.push({
      label: d.toLocaleDateString(undefined, { weekday: "narrow" }),
      has: dayHas.has(d.toDateString()),
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="text-6xl mb-2 leading-none">📓</div>
        <h1 className="text-4xl font-bold tracking-tight">AI Builder's Journal</h1>
        <div className="text-[var(--text-muted)] text-sm mt-2">{_today()}</div>
      </div>

      {/* Property rows */}
      <div className="space-y-0 mb-10">
        <PropertyRow icon="🎯" label="Current focus">
          <AutoTextarea
            value={state.focus}
            placeholder="What are you focused on right now?"
            onChange={(e) => update("focus", e.target.value)}
          />
        </PropertyRow>

        <PropertyRow icon="📊" label="Total sessions">
          <span className="px-2 py-0.5">{state.sessions.length}</span>
        </PropertyRow>

        <PropertyRow icon="🗓️" label="This week">
          <div className="flex items-center gap-2 px-2 py-0.5">
            <span>{thisWeek.length} session{thisWeek.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-1 ml-2">
              {Array.from({ length: Math.max(7, Math.min(14, thisWeek.length)) }).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: i < thisWeek.length ? "var(--pip-done)" : "var(--pip-upcoming)",
                  }}
                />
              ))}
            </div>
          </div>
        </PropertyRow>

        <PropertyRow icon="💡" label="Active ideas">
          <button
            onClick={() => onNav("ideas")}
            className="px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] text-left"
          >
            {activeIdeas.length} {activeIdeas.length === 1 ? "idea" : "ideas"}
          </button>
        </PropertyRow>

        <PropertyRow icon="🚧" label="Blockers">
          <button
            onClick={() => onNav("stuck")}
            className="px-2 py-0.5 rounded hover:bg-[var(--bg-hover)] text-left"
            style={{ color: blockerCount > 0 ? "var(--tag-coral-fg)" : "var(--text)" }}
          >
            {blockerCount}
          </button>
        </PropertyRow>

        <PropertyRow icon="🗺️" label="Roadmap · Phase 2">
          <div className="flex items-center gap-3 px-2 py-0.5">
            <div className="flex items-center gap-1">
              {state.phase2.done.map((done, i) => {
                const isCurrent = i + 1 === p2Week;
                const color = done
                  ? "var(--pip-done)"
                  : isCurrent
                  ? "var(--pip-current)"
                  : "var(--pip-upcoming)";
                return (
                  <button
                    key={i}
                    title={`Week ${i + 1}${state.phase2.customThemes?.[i] ? `: ${state.phase2.customThemes[i]}` : ""}`}
                    onClick={() => onNav("phase")}
                    className="h-2 w-4 rounded-sm"
                    style={{ background: color }}
                  />
                );
              })}
            </div>
            <span className="text-[var(--text-muted)] text-xs">
              {state.phase2.done.filter(Boolean).length}/12 weeks
              {p2Week >= 1 && p2Week <= 12 && ` · in week ${p2Week}`}
            </span>
          </div>
        </PropertyRow>

        <PropertyRow icon="📮" label="This week">
          <div className="flex items-center gap-3 px-2 py-0.5 text-xs">
            {thisWeekMetric ? (
              <>
                <span className="text-[var(--text)]">{thisWeekMetric.proposals} proposals</span>
                <span className="text-[var(--text-muted)]">{thisWeekMetric.replies} replies</span>
                <span className="text-[var(--text-muted)]">{thisWeekMetric.calls} calls</span>
                <span style={{ color: thisWeekMetric.invoiced > 0 ? "var(--tag-green-fg)" : "var(--text-muted)" }}>
                  ${thisWeekMetric.invoiced}
                </span>
              </>
            ) : (
              <button className="text-[var(--text-muted)] hover:text-[var(--text)]" onClick={() => onNav("phase")}>
                Not logged yet →
              </button>
            )}
          </div>
        </PropertyRow>

        <PropertyRow icon="🔥" label="7-day streak">
          <div className="flex items-center gap-3 px-2 py-0.5">
            <div className="flex items-center gap-1">
              {days7.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className="w-5 h-5 rounded-sm"
                    style={{
                      background: d.has ? "var(--pip-done)" : "var(--pip-upcoming)",
                    }}
                  />
                  <span className="text-[10px] text-[var(--text-faint)]">{d.label}</span>
                </div>
              ))}
            </div>
            <span className="text-[var(--text-muted)] text-xs ml-2">
              {streak > 0 ? `${streak}-day streak` : "no current streak"} · {last7.length} this week
            </span>
          </div>
        </PropertyRow>
      </div>

      {/* Notes & To-Dos widget */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Notes preview */}
        <div
          className="border rounded-lg p-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">📝 Notes</span>
            <button
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => { setNotesTab("notes"); setNotesOpen(true); }}
            >
              Manage →
            </button>
          </div>
          {state.notes.length === 0 ? (
            <button
              className="text-xs text-[var(--text-faint)] w-full text-left hover:text-[var(--text-muted)]"
              onClick={() => { setNotesTab("notes"); setNotesOpen(true); }}
            >
              + Add a note
            </button>
          ) : (
            <div className="space-y-1.5">
              {state.notes.slice(0, 3).map((n) => {
                const p = previewMultiline(n.text);
                return (
                  <div key={n.id} className="text-xs text-[var(--text-muted)] truncate">
                    {p.text}
                    {p.more > 0 && (
                      <span className="text-[var(--text-faint)] ml-1">+{p.more} {p.more === 1 ? "line" : "lines"}</span>
                    )}
                  </div>
                );
              })}
              {state.notes.length > 3 && (
                <div className="text-[10px] text-[var(--text-faint)]">
                  +{state.notes.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Todos preview */}
        <div
          className="border rounded-lg p-4"
          style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">✅ To-Dos</span>
            <button
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => { setNotesTab("todos"); setNotesOpen(true); }}
            >
              Manage →
            </button>
          </div>
          {state.todos.filter((t) => !t.done).length === 0 ? (
            <button
              className="text-xs text-[var(--text-faint)] w-full text-left hover:text-[var(--text-muted)]"
              onClick={() => { setNotesTab("todos"); setNotesOpen(true); }}
            >
              + Add a to-do
            </button>
          ) : (
            <div className="space-y-1.5">
              {state.todos.filter((t) => !t.done).slice(0, 3).map((t) => {
                const p = previewMultiline(t.text);
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => {
                        app.update(
                          "todos",
                          state.todos.map((td) =>
                            td.id === t.id
                              ? { ...td, done: true, completedAt: new Date().toISOString() }
                              : td
                          )
                        );
                      }}
                      className="cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-[var(--text-muted)] truncate flex-1 min-w-0">
                      {p.text}
                      {p.more > 0 && (
                        <span className="text-[var(--text-faint)] ml-1">+{p.more} {p.more === 1 ? "line" : "lines"}</span>
                      )}
                    </span>
                  </div>
                );
              })}
              {state.todos.filter((t) => !t.done).length > 3 && (
                <div className="text-[10px] text-[var(--text-faint)]">
                  +{state.todos.filter((t) => !t.done).length - 3} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions database */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        <button
          onClick={() => onNav("session")}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          + New entry
        </button>
      </div>

      {recent.length === 0 ? (
        <div
          className="text-sm text-[var(--text-faint)] py-10 text-center border rounded"
          style={{ borderColor: "var(--border)" }}
        >
          No sessions yet. Add your first end-of-chat summary in the Session log tab.
        </div>
      ) : (
        <div className="border rounded overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <div
            className="grid text-xs uppercase tracking-wide text-[var(--text-faint)] px-3 py-2 border-b"
            style={{
              gridTemplateColumns: "1fr 140px 110px",
              borderColor: "var(--border)",
              background: "var(--bg-subtle)",
            }}
          >
            <div>Entry</div>
            <div>Type</div>
            <div>Date</div>
          </div>
          {recent.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedSession(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedSession(s);
                }
              }}
              className="grid items-center px-3 py-2.5 border-b last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer focus:outline-none focus:bg-[var(--bg-hover)]"
              style={{
                gridTemplateColumns: "1fr 140px 110px",
                borderColor: "var(--border)",
              }}
            >
              <div className="text-sm truncate pr-3 flex items-center gap-2">
                {s.win && <span title="Win">⭐</span>}
                <span className="truncate">{firstLine(s.entry) || <em className="text-[var(--text-faint)]">(empty)</em>}</span>
              </div>
              <div><TypeTag type={s.type} types={state.sessionTypes} /></div>
              <div className="text-sm text-[var(--text-muted)]">{fmtShortDate(s.date)}</div>
            </div>
          ))}
        </div>
      )}

      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        types={state.sessionTypes}
      />

      <NotesModal
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        app={app}
        initialTab={notesTab}
      />
    </div>
  );
}

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.replace(/^\*+|\*+$/g, "").replace(/^[-#>\s]+/, "").trim().slice(0, 120);
}

// Returns the first non-empty line plus a "+N lines" suffix if there are more.
function previewMultiline(s: string): { text: string; more: number } {
  const lines = s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const first = (lines[0] ?? "").slice(0, 120);
  return { text: first, more: Math.max(0, lines.length - 1) };
}
