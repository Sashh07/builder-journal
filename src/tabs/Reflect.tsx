import { useEffect, useMemo, useState } from "react";
import type { useAppState } from "../state";
import { startOfWeek } from "../state";
import type { ReflectionEntry, Session } from "../types";
import {
  PropertyRow,
  SectionTitle,
  SessionDetailModal,
  TypeTag,
  fmtShortDate,
  uid,
  AutoTextarea,
} from "../ui";

// Helpers
function weekStartISO(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return startOfWeek(date).toISOString().slice(0, 10);
}

function weekRangeLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${fmtShortDate(start.toISOString())} – ${fmtShortDate(end.toISOString())}`;
}

function isEmptyReflection(r: {
  feeling: string;
  challenge: string;
  breakthrough: string;
  next: string;
}): boolean {
  return (
    !r.feeling.trim() &&
    !r.challenge.trim() &&
    !r.breakthrough.trim() &&
    !r.next.trim()
  );
}

export default function Reflect({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update } = app;
  const r = state.reflection;
  const log = state.reflectionLog;

  // ----- Auto-archive: if current reflection belongs to a past week, lock it in -----
  // We track which week the active reflection form is for via reflectionLog logic:
  // - If reflectionLog has an entry for this week → form is locked (read-only) for that week.
  // - If reflectionLog has no entry for this week but `reflection` has content → it's the current week's WIP.
  // - On mount/week change: if WIP exists but it's now a past week, push to log.
  // We need a stored "current week marker" to know which week the WIP belongs to.
  // We'll derive it: if there's a `reflectionLog` with most recent entry, anything after that week
  // is unclaimed; the WIP is for the most recent unclaimed week.
  // Simplification: The WIP always represents the current calendar week. If on load,
  // the latest log entry's weekStart < (this week's start), and the WIP has content,
  // we assume the WIP was for the most recent past week not in log → archive it.

  const thisWeekStart = useMemo(() => weekStartISO(new Date()), []);

  useEffect(() => {
    // Find the most recent week that has no log entry but might own the WIP
    const loggedWeeks = new Set(log.map((e) => e.weekStart));
    if (loggedWeeks.has(thisWeekStart)) return; // current week already logged, nothing to do

    if (isEmptyReflection(r)) return; // nothing to archive

    // Determine which week the WIP belongs to:
    // Heuristic: it belongs to the most recent past week that is NOT in the log.
    // If there's no such past week (i.e. user has just started), it belongs to the current week
    // → don't archive yet.
    // Walk back week by week from last week, looking for a gap.
    const cursor = new Date(thisWeekStart);
    cursor.setDate(cursor.getDate() - 7); // last week
    const lastWeek = cursor.toISOString().slice(0, 10);

    // If last week is in the log → WIP belongs to the current week, don't archive.
    if (loggedWeeks.has(lastWeek)) return;

    // Walk back further to find the most recent unlogged past week.
    // We need to stop somewhere — limit to 26 weeks back to be safe.
    let targetWeek = lastWeek;
    for (let i = 0; i < 26; i++) {
      const probe = new Date(targetWeek);
      probe.setDate(probe.getDate() - 7);
      const probeIso = probe.toISOString().slice(0, 10);
      if (loggedWeeks.has(probeIso)) break;
      // Only walk back if no log exists at all (first-time archive)
      // Otherwise, stop at the most recent unlogged past week.
      if (log.length > 0) break;
      targetWeek = probeIso;
    }

    // Archive the WIP to targetWeek
    const newEntry: ReflectionEntry = {
      id: uid(),
      weekStart: targetWeek,
      feeling: r.feeling,
      challenge: r.challenge,
      breakthrough: r.breakthrough,
      next: r.next,
      saved: new Date().toISOString(),
    };
    update("reflectionLog", [newEntry, ...log]);
    // Clear the WIP for the new week
    update("reflection", { feeling: "", challenge: "", breakthrough: "", next: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ----- Build week list for the dropdown -----
  // Includes: current week (always) + all past weeks (from log and from sessions and from missed weeks in between)
  // Filtered: weeks before MIN_WEEK_DATE are excluded UNLESS they have actual reflection content
  const MIN_WEEK_DATE = "2026-05-03"; // hide empty synthetic weeks before this date

  const allWeeks = useMemo(() => {
    const set = new Set<string>();
    set.add(thisWeekStart);
    for (const e of log) set.add(e.weekStart);
    for (const s of state.sessions) set.add(weekStartISO(s.date));

    // Also fill in missed weeks between earliest known week and current week
    if (set.size > 1) {
      const sorted = Array.from(set).sort();
      const earliest = new Date(sorted[0]);
      const latest = new Date(thisWeekStart);
      const cursor = new Date(earliest);
      while (cursor <= latest) {
        set.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 7);
      }
    }

    // Filter: a week is kept if any of these is true:
    //   - it's >= MIN_WEEK_DATE
    //   - it's the current week (always shown)
    //   - it has actual reflection log content (preserve real reflections)
    const loggedWeeks = new Set(log.map((e) => e.weekStart));
    const filtered = Array.from(set).filter((wk) => {
      if (wk >= MIN_WEEK_DATE) return true;
      if (wk === thisWeekStart) return true;
      if (loggedWeeks.has(wk)) return true;
      return false;
    });

    return filtered.sort((a, b) => (a < b ? 1 : -1)); // newest first
  }, [log, state.sessions, thisWeekStart]);

  // ----- Selected week -----
  const [selectedWeek, setSelectedWeek] = useState<string>(thisWeekStart);

  const isCurrentWeek = selectedWeek === thisWeekStart;
  const selectedLogEntry = log.find((e) => e.weekStart === selectedWeek);
  const isPastWeek = !isCurrentWeek;
  const isMissed = isPastWeek && !selectedLogEntry;

  // Sessions for the selected week
  const selectedWeekSessions = useMemo(() => {
    const start = new Date(selectedWeek);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return state.sessions
      .filter((s) => {
        const d = new Date(s.date);
        return d >= start && d < end;
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [state.sessions, selectedWeek]);

  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  return (
    <div>
      <SectionTitle
        emoji="🪞"
        title="Reflect"
        subtitle="Sunday reflection ritual. Read the week. Update the four prompts."
      />

      {/* Week dropdown */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <label className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
          Week
        </label>
        <select
          className="notion-input text-sm"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          style={{ width: "auto", minWidth: 240 }}
        >
          {allWeeks.map((wk) => {
            const isCurr = wk === thisWeekStart;
            const hasLog = log.some((e) => e.weekStart === wk);
            const label = isCurr
              ? `Current week · ${weekRangeLabel(wk)}`
              : `${weekRangeLabel(wk)}${hasLog ? "" : " · missed"}`;
            return (
              <option key={wk} value={wk}>
                {label}
              </option>
            );
          })}
        </select>
        {isMissed && (
          <span
            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
            style={{
              background: "var(--tag-coral-bg)",
              color: "var(--tag-coral-fg)",
            }}
          >
            Missed reflection
          </span>
        )}
        {isPastWeek && selectedLogEntry && (
          <span
            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
            style={{
              background: "var(--tag-gray-bg)",
              color: "var(--tag-gray-fg)",
            }}
          >
            Locked
          </span>
        )}
      </div>

      {/* Two-column layout: sessions left, reflection right; stacks on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Sessions for selected week */}
        <div>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wide">
            Sessions · {weekRangeLabel(selectedWeek)}
          </h2>
          {selectedWeekSessions.length === 0 ? (
            <div
              className="text-sm text-[var(--text-faint)] py-10 text-center border rounded"
              style={{ borderColor: "var(--border)" }}
            >
              No sessions this week.
            </div>
          ) : (
            <div
              className="border rounded divide-y"
              style={{ borderColor: "var(--border)" }}
            >
              {selectedWeekSessions.map((s) => (
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
                  className="grid items-center px-3 py-2.5 hover:bg-[var(--bg-hover)] cursor-pointer focus:outline-none focus:bg-[var(--bg-hover)]"
                  style={{
                    gridTemplateColumns: "80px 120px 1fr",
                    borderColor: "var(--border)",
                  }}
                >
                  <div className="text-xs text-[var(--text-muted)]">
                    {fmtShortDate(s.date)}
                  </div>
                  <div>
                    <TypeTag type={s.type} types={state.sessionTypes} />
                  </div>
                  <div className="text-sm truncate">
                    {s.win && <span className="mr-1">⭐</span>}
                    {firstLine(s.entry)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Reflection form (current week) or read-only past entry */}
        <div>
          <h2 className="text-sm font-semibold mb-3 text-[var(--text-muted)] uppercase tracking-wide">
            Reflection · {weekRangeLabel(selectedWeek)}
          </h2>
          {isCurrentWeek ? (
            // Editable form (auto-saves; will be locked when next week begins)
            <div className="space-y-0">
              <PropertyRow icon="❤️" label="How I'm feeling">
                <AutoTextarea
                  minRows={2}
                  value={r.feeling}
                  onChange={(e) =>
                    update("reflection", { ...r, feeling: e.target.value })
                  }
                />
              </PropertyRow>
              <PropertyRow icon="🌀" label="Current challenge">
                <AutoTextarea
                  minRows={2}
                  value={r.challenge}
                  onChange={(e) =>
                    update("reflection", { ...r, challenge: e.target.value })
                  }
                />
              </PropertyRow>
              <PropertyRow icon="✨" label="Breakthrough this week">
                <AutoTextarea
                  minRows={2}
                  value={r.breakthrough}
                  onChange={(e) =>
                    update("reflection", { ...r, breakthrough: e.target.value })
                  }
                />
              </PropertyRow>
              <PropertyRow icon="🎯" label="Next focus">
                <AutoTextarea
                  minRows={2}
                  value={r.next}
                  onChange={(e) =>
                    update("reflection", { ...r, next: e.target.value })
                  }
                />
              </PropertyRow>
              <div className="text-[11px] text-[var(--text-faint)] mt-3 px-2">
                Saves automatically. Locks in when next week begins.
              </div>
            </div>
          ) : selectedLogEntry ? (
            // Read-only past reflection card
            <div
              className="border rounded-lg p-4 space-y-4"
              style={{ borderColor: "var(--border)" }}
            >
              <ReflectionField icon="❤️" label="How I was feeling" value={selectedLogEntry.feeling} />
              <ReflectionField icon="🌀" label="Current challenge" value={selectedLogEntry.challenge} />
              <ReflectionField icon="✨" label="Breakthrough" value={selectedLogEntry.breakthrough} />
              <ReflectionField icon="🎯" label="Next focus" value={selectedLogEntry.next} />
              <div
                className="text-[11px] text-[var(--text-faint)] pt-3 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                Locked in on {new Date(selectedLogEntry.saved).toLocaleString()}
              </div>
            </div>
          ) : (
            // Missed week
            <div
              className="border rounded-lg p-6 text-center"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-subtle)",
              }}
            >
              <div className="text-3xl mb-2 opacity-50">🕳️</div>
              <div className="text-sm font-medium text-[var(--text-muted)] mb-1">
                No reflection saved for this week
              </div>
              <div className="text-xs text-[var(--text-faint)]">
                This week passed without a reflection being logged.
              </div>
            </div>
          )}
        </div>
      </div>

      <SessionDetailModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        types={state.sessionTypes}
      />
    </div>
  );
}

function ReflectionField({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-1 flex items-center gap-1.5">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-sm whitespace-pre-wrap">
        {value ? (
          value
        ) : (
          <em className="text-[var(--text-faint)]">(empty)</em>
        )}
      </div>
    </div>
  );
}

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line
    .replace(/^\*+|\*+$/g, "")
    .replace(/^[-#>\s]+/, "")
    .trim()
    .slice(0, 140);
}
