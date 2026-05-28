import { useState, useMemo } from "react";
import type { useAppState } from "../state";
import type { IdeaStatus, Idea } from "../types";
import { IconPlus, IconTrash, IconEdit, SectionTitle, StatusTag, uid, AutoTextarea } from "../ui";

const STATUSES: IdeaStatus[] = ["Active", "Researching", "Paused", "Shipped"];
const LAYOUT_KEY = "ideas_layout";

// Map status to a small dot color that matches the existing StatusTag palette
const STATUS_DOT: Record<IdeaStatus, string> = {
  Active: "var(--tag-purple-fg)",
  Researching: "var(--tag-blue-fg)",
  Paused: "var(--tag-amber-fg)",
  Shipped: "var(--tag-teal-fg)",
};

// Sort ideas by priority (ascending), with created date as tiebreaker (newest first).
// Ideas without a priority sort last.
function sortByPriority(ideas: Idea[]): Idea[] {
  return [...ideas].sort((a, b) => {
    const pa = a.priority ?? Number.POSITIVE_INFINITY;
    const pb = b.priority ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return b.created.localeCompare(a.created);
  });
}

export default function Ideas({ app }: { app: ReturnType<typeof useAppState> }) {
  const { state, update } = app;
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [layout, setLayout] = useState<"cards" | "kanban">(() => {
    try {
      const v = localStorage.getItem(LAYOUT_KEY);
      return v === "kanban" ? "kanban" : "cards";
    } catch {
      return "cards";
    }
  });
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [next, setNext] = useState("");
  const [deps, setDeps] = useState("");
  const [status, setStatus] = useState<IdeaStatus>("Active");
  const [errors, setErrors] = useState<{ title?: string; why?: string }>({});

  const setLayoutPersisted = (l: "cards" | "kanban") => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
  };

  const resetForm = () => {
    setTitle(""); setWhy(""); setNext(""); setDeps(""); setStatus("Active");
    setEditingId(null);
    setErrors({});
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (i: Idea) => {
    setEditingId(i.id);
    setTitle(i.title);
    setWhy(i.why);
    setNext(i.next);
    setDeps(i.deps);
    setStatus(i.status);
    setOpen(true);
  };

  const cancel = () => {
    resetForm();
    setOpen(false);
  };

  const submit = () => {
    const nextErrors: { title?: string; why?: string } = {};
    if (!title.trim()) nextErrors.title = "Title is required";
    if (!why.trim()) nextErrors.why = "Why is required";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    if (editingId) {
      // Update existing
      update("ideas", state.ideas.map((i) =>
        i.id === editingId
          ? { ...i, title: title.trim(), why: why.trim(), next: next.trim(), deps: deps.trim(), status }
          : i
      ));
    } else {
      // Create new — assign a priority just above (lower number = higher priority)
      // any existing idea in the same status column, so new ideas land at the top.
      const minPriorityInColumn = state.ideas
        .filter((i) => !i.archived && i.status === status)
        .reduce((min, i) => Math.min(min, i.priority ?? Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
      const newPriority = Number.isFinite(minPriorityInColumn) ? minPriorityInColumn - 1 : 0;
      update("ideas", [
        {
          id: uid(),
          title: title.trim(),
          why: why.trim(),
          next: next.trim(),
          deps: deps.trim(),
          status,
          created: new Date().toISOString(),
          archived: false,
          priority: newPriority,
        },
        ...state.ideas,
      ]);
    }
    resetForm();
    setOpen(false);
  };

  const setIdeaStatus = (id: string, s: IdeaStatus) =>
    update("ideas", state.ideas.map((i) => (i.id === id ? { ...i, status: s } : i)));

  const toggleArchive = (id: string) =>
    update("ideas", state.ideas.map((i) => (i.id === id ? { ...i, archived: !i.archived } : i)));

  const del = (id: string) =>
    update("ideas", state.ideas.filter((i) => i.id !== id));

  // ── Drag-and-drop state ──
  // The id of the currently dragged card, plus the column it came from.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The current drop indicator: which column + which insertion index within it.
  const [dropTarget, setDropTarget] = useState<{ status: IdeaStatus; index: number } | null>(null);

  // Apply a move: place the dragged idea into target status at target insertion index.
  // Renumbers all affected ideas' priorities to keep them clean integers (0, 1, 2, ...).
  const applyDrop = (toStatus: IdeaStatus, insertIndex: number) => {
    if (!draggingId) return;
    const dragged = state.ideas.find((i) => i.id === draggingId);
    if (!dragged) return;

    // Build the new column order
    const otherInTarget = sortByPriority(
      state.ideas.filter((i) => !i.archived && i.status === toStatus && i.id !== draggingId)
    );
    const insertAt = Math.max(0, Math.min(insertIndex, otherInTarget.length));
    const newColumnOrder = [
      ...otherInTarget.slice(0, insertAt),
      dragged,
      ...otherInTarget.slice(insertAt),
    ];

    // Build the next ideas array with updated priorities + status for the dragged card
    const priorityMap = new Map<string, number>();
    newColumnOrder.forEach((idea, idx) => priorityMap.set(idea.id, idx));

    const nextIdeas = state.ideas.map((i) => {
      if (i.id === draggingId) {
        return { ...i, status: toStatus, priority: priorityMap.get(i.id) ?? 0 };
      }
      if (priorityMap.has(i.id)) {
        return { ...i, priority: priorityMap.get(i.id)! };
      }
      return i;
    });

    update("ideas", nextIdeas);
    setDraggingId(null);
    setDropTarget(null);
  };

  const filtered = useMemo(() => {
    const visible = state.ideas.filter((i) =>
      view === "archived" ? i.archived : !i.archived
    );
    return sortByPriority(visible);
  }, [state.ideas, view]);

  const activeCount = state.ideas.filter((i) => !i.archived).length;
  const archivedCount = state.ideas.filter((i) => i.archived).length;

  return (
    <div>
      <SectionTitle emoji="💡" title="Ideas log" subtitle="Anything worth chasing — what excites you, what to try next, what's blocking it." />

      {/* View toggle + layout toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div
          className="inline-flex rounded-lg p-1 border"
          style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
        >
          <button
            onClick={() => setView("active")}
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              background: view === "active" ? "var(--bg)" : "transparent",
              color: view === "active" ? "var(--text)" : "var(--text-muted)",
              fontWeight: view === "active" ? 600 : 400,
              boxShadow: view === "active" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Active <span className="ml-1 text-[var(--text-faint)]">{activeCount}</span>
          </button>
          <button
            onClick={() => setView("archived")}
            className="px-3 py-1.5 text-xs rounded-md transition-colors"
            style={{
              background: view === "archived" ? "var(--bg)" : "transparent",
              color: view === "archived" ? "var(--text)" : "var(--text-muted)",
              fontWeight: view === "archived" ? 600 : 400,
              boxShadow: view === "archived" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Archived <span className="ml-1 text-[var(--text-faint)]">{archivedCount}</span>
          </button>
        </div>

        {/* Layout toggle — only meaningful for Active view */}
        {view === "active" && (
          <div
            className="inline-flex rounded-lg p-1 border"
            style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
          >
            <button
              onClick={() => setLayoutPersisted("cards")}
              className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: layout === "cards" ? "var(--bg)" : "transparent",
                color: layout === "cards" ? "var(--text)" : "var(--text-muted)",
                fontWeight: layout === "cards" ? 600 : 400,
                boxShadow: layout === "cards" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
              title="Cards view"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="8" height="8" rx="1" />
                <rect x="13" y="3" width="8" height="8" rx="1" />
                <rect x="3" y="13" width="8" height="8" rx="1" />
                <rect x="13" y="13" width="8" height="8" rx="1" />
              </svg>
              Cards
            </button>
            <button
              onClick={() => setLayoutPersisted("kanban")}
              className="px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: layout === "kanban" ? "var(--bg)" : "transparent",
                color: layout === "kanban" ? "var(--text)" : "var(--text-muted)",
                fontWeight: layout === "kanban" ? 600 : 400,
                boxShadow: layout === "kanban" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
              title="Kanban view"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="14" rx="1" />
                <rect x="17" y="3" width="4" height="10" rx="1" />
              </svg>
              Kanban
            </button>
          </div>
        )}
      </div>

      {/* New / edit idea form */}
      {(view === "active" || editingId) && (
        <div className="mb-6">
          {open ? (
            <div
              className="border rounded-lg p-5"
              style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
            >
              {editingId && (
                <div className="text-xs text-[var(--text-muted)] mb-3 flex items-center gap-1.5">
                  <IconEdit /> <span>Editing idea</span>
                </div>
              )}
              <div className="grid gap-3">
                <Field label="Title" required error={errors.title}>
                  <input className="notion-input" value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (errors.title && e.target.value.trim()) setErrors({ ...errors, title: undefined });
                    }}
                    style={{
                      background: "var(--bg)",
                      borderColor: errors.title ? "var(--tag-coral-fg)" : "var(--border-strong)",
                    }} />
                </Field>
                <Field label="Why it excites me" required error={errors.why}>
                  <AutoTextarea value={why}
                    onChange={(e) => {
                      setWhy(e.target.value);
                      if (errors.why && e.target.value.trim()) setErrors({ ...errors, why: undefined });
                    }}
                    placeholder="What's exciting about this idea?"
                    minRows={2}
                    style={{
                      background: "var(--bg)",
                      borderColor: errors.why ? "var(--tag-coral-fg)" : "var(--border-strong)",
                    }} />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Next step">
                    <AutoTextarea value={next} onChange={(e) => setNext(e.target.value)}
                      placeholder="What's the next concrete step?"
                      style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }} />
                  </Field>
                  <Field label="Dependencies">
                    <AutoTextarea value={deps} onChange={(e) => setDeps(e.target.value)}
                      placeholder="What does this depend on?"
                      style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }} />
                  </Field>
                </div>
                <Field label="Status">
                  <select className="notion-input" value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus)}
                    style={{ background: "var(--bg)", borderColor: "var(--border-strong)" }}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="flex gap-2 justify-end">
                  <button className="btn" onClick={cancel}>Cancel</button>
                  <button className="btn btn-primary" onClick={submit}>{editingId ? "Save changes" : "Save idea"}</button>
                </div>
              </div>
            </div>
          ) : (
            <button className="btn" onClick={openNew}>
              <IconPlus /> New idea
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-sm text-[var(--text-faint)] py-10 text-center border rounded"
          style={{ borderColor: "var(--border)" }}>
          {view === "active" ? "No ideas yet." : "No archived ideas."}
        </div>
      ) : layout === "kanban" && view === "active" ? (
        // ── Kanban view ──
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Drag cards to reorder within a column or move across statuses. Top of column = highest priority.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STATUSES.map((colStatus) => {
              const colIdeas = filtered.filter((i) => i.status === colStatus);
              const isDropColumn = dropTarget?.status === colStatus;

              return (
                <div
                  key={colStatus}
                  className="rounded-lg p-2 flex flex-col gap-2 min-h-32"
                  style={{
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--border)",
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    // If dragging over empty space (not over a card), set drop to end.
                    if (!dropTarget || dropTarget.status !== colStatus) {
                      setDropTarget({ status: colStatus, index: colIdeas.length });
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const target = dropTarget && dropTarget.status === colStatus
                      ? dropTarget
                      : { status: colStatus, index: colIdeas.length };
                    applyDrop(target.status, target.index);
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center gap-1.5 px-1.5 py-1">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: STATUS_DOT[colStatus] }}
                    />
                    <span className="text-xs font-semibold">{colStatus}</span>
                    <span className="text-[10px] text-[var(--text-faint)]">{colIdeas.length}</span>
                  </div>

                  {/* Cards in this column */}
                  {colIdeas.map((idea, idx) => {
                    const showInsertAbove = isDropColumn && dropTarget!.index === idx;
                    const isDragging = draggingId === idea.id;
                    return (
                      <div key={idea.id}>
                        {/* Drop indicator above this card */}
                        {showInsertAbove && (
                          <div
                            className="h-1 rounded-sm mb-2"
                            style={{ background: STATUS_DOT[colStatus], opacity: 0.5 }}
                          />
                        )}
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", idea.id);
                            setDraggingId(idea.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Determine if we're in the top half (insert above this card)
                            // or bottom half (insert below this card) using mouse Y vs midpoint
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const midY = rect.top + rect.height / 2;
                            const insertIdx = e.clientY < midY ? idx : idx + 1;
                            if (
                              !dropTarget ||
                              dropTarget.status !== colStatus ||
                              dropTarget.index !== insertIdx
                            ) {
                              setDropTarget({ status: colStatus, index: insertIdx });
                            }
                          }}
                          className="group rounded-md p-2.5 cursor-grab active:cursor-grabbing transition-opacity"
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            opacity: isDragging ? 0.4 : 1,
                          }}
                        >
                          <div className="flex items-start gap-1.5">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-[var(--text-faint)] mt-0.5 shrink-0"
                            >
                              <circle cx="9" cy="5" r="1" />
                              <circle cx="9" cy="12" r="1" />
                              <circle cx="9" cy="19" r="1" />
                              <circle cx="15" cy="5" r="1" />
                              <circle cx="15" cy="12" r="1" />
                              <circle cx="15" cy="19" r="1" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-semibold leading-tight mb-1 break-words">
                                {idea.title}
                              </h4>
                              {idea.why && (
                                <p className="text-[11px] text-[var(--text-muted)] leading-snug line-clamp-2 break-words">
                                  {idea.why.split("\n")[0]}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                              <button
                                className="icon-btn"
                                style={{ width: 22, height: 22 }}
                                onClick={() => openEdit(idea)}
                                title="Edit"
                              >
                                <IconEdit />
                              </button>
                              <button
                                className="icon-btn"
                                style={{ width: 22, height: 22 }}
                                onClick={() => del(idea.id)}
                                title="Delete"
                              >
                                <IconTrash />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Drop indicator at the bottom (empty column or appending) */}
                  {isDropColumn && dropTarget!.index >= colIdeas.length && (
                    <div
                      className="h-1 rounded-sm"
                      style={{ background: STATUS_DOT[colStatus], opacity: 0.5 }}
                    />
                  )}

                  {/* Empty column placeholder */}
                  {colIdeas.length === 0 && !isDropColumn && (
                    <div
                      className="text-[11px] text-[var(--text-faint)] text-center py-4 px-2 rounded border border-dashed"
                      style={{ borderColor: "var(--border)" }}
                    >
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ── Cards view ──
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((i) => {
            const isArchived = !!i.archived;
            return (
              <div
                key={i.id}
                className="border rounded-lg p-4 group flex flex-col gap-3 transition-opacity"
                style={{
                  borderColor: "var(--border)",
                  opacity: isArchived ? 0.55 : 1,
                  background: isArchived ? "var(--bg-subtle)" : "transparent",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{i.title}</h3>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    {!isArchived && (
                      <button className="icon-btn"
                        onClick={() => openEdit(i)} title="Edit">
                        <IconEdit />
                      </button>
                    )}
                    <button className="icon-btn"
                      onClick={() => del(i.id)} title="Delete">
                      <IconTrash />
                    </button>
                  </div>
                </div>
                {i.why && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-0.5">Why</div>
                    <div className="text-sm whitespace-pre-wrap">{i.why}</div>
                  </div>
                )}
                {i.next && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-0.5">Next step</div>
                    <div className="text-sm whitespace-pre-wrap">{i.next}</div>
                  </div>
                )}
                {i.deps && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mb-0.5">Dependencies</div>
                    <div className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{i.deps}</div>
                  </div>
                )}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <StatusTag status={i.status} />
                  <select
                    className="notion-input text-xs"
                    value={isArchived ? "__archive_marker__" : i.status}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "Archive") {
                        toggleArchive(i.id);
                      } else if (val === "Restore") {
                        toggleArchive(i.id);
                      } else if (val !== "__archive_marker__") {
                        setIdeaStatus(i.id, val as IdeaStatus);
                      }
                    }}
                    style={{ width: "auto" }}
                  >
                    {isArchived ? (
                      <>
                        <option value="__archive_marker__" disabled>
                          Archived
                        </option>
                        <option value="Restore">Restore</option>
                      </>
                    ) : (
                      <>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        <option disabled>──────────</option>
                        <option value="Archive">Archive</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, error, required }: { label: string; children: React.ReactNode; error?: string; required?: boolean }) {
  return (
    <label className="block">
      <div className="text-xs text-[var(--text-muted)] mb-1.5">
        {label}
        {required && <span className="text-[var(--tag-coral-fg)] ml-0.5">*</span>}
      </div>
      {children}
      {error && (
        <div className="text-xs mt-1" style={{ color: "var(--tag-coral-fg)" }}>
          {error}
        </div>
      )}
    </label>
  );
}
