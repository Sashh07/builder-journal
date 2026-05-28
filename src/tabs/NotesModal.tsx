import { useState } from "react";
import type { useAppState } from "../state";
import type { Note, Todo } from "../types";
import { uid, IconTrash, IconPlus, IconX, AutoTextarea } from "../ui";

type Tab = "notes" | "todos";

export default function NotesModal({
  open,
  onClose,
  app,
  initialTab = "notes",
}: {
  open: boolean;
  onClose: () => void;
  app: ReturnType<typeof useAppState>;
  initialTab?: Tab;
}) {
  const { state, update } = app;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [noteText, setNoteText] = useState("");
  const [todoText, setTodoText] = useState("");
  const [showDone, setShowDone] = useState(false);

  if (!open) return null;

  // --- Notes ---
  const addNote = () => {
    if (!noteText.trim()) return;
    const newNote: Note = {
      id: uid(),
      text: noteText.trim(),
      created: new Date().toISOString(),
    };
    update("notes", [newNote, ...state.notes]);
    setNoteText("");
  };
  const deleteNote = (id: string) =>
    update("notes", state.notes.filter((n) => n.id !== id));

  // --- Todos ---
  const addTodo = () => {
    if (!todoText.trim()) return;
    const newTodo: Todo = {
      id: uid(),
      text: todoText.trim(),
      done: false,
      created: new Date().toISOString(),
    };
    update("todos", [newTodo, ...state.todos]);
    setTodoText("");
  };
  const toggleTodo = (id: string) =>
    update(
      "todos",
      state.todos.map((t) =>
        t.id === id
          ? { ...t, done: !t.done, completedAt: !t.done ? new Date().toISOString() : undefined }
          : t
      )
    );
  const deleteTodo = (id: string) =>
    update("todos", state.todos.filter((t) => t.id !== id));
  const clearDone = () =>
    update("todos", state.todos.filter((t) => !t.done));

  const activeTodos = state.todos.filter((t) => !t.done);
  const doneTodos = state.todos.filter((t) => t.done);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-lg shadow-xl my-auto"
        style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-1">
            {(["notes", "todos"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-3 py-1 text-sm rounded-md transition-colors"
                style={{
                  background: tab === t ? "var(--bg-hover)" : "transparent",
                  fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {t === "notes" ? "📝 Notes" : "✅ To-Dos"}
                <span className="ml-1.5 text-[10px] text-[var(--text-faint)]">
                  {t === "notes" ? state.notes.length : activeTodos.length}
                </span>
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {tab === "notes" ? (
            <div className="space-y-4">
              {/* Add note */}
              <div className="flex gap-2">
                <AutoTextarea
                  className="notion-input flex-1 text-sm"
                  minRows={2}
                  placeholder="Jot a note — journal idea, quick thought, link…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
                  }}
                  style={{ borderColor: "var(--border-strong)", background: "var(--bg-subtle)" }}
                />
                <button className="btn btn-primary self-start" onClick={addNote}>
                  <IconPlus />
                </button>
              </div>
              <div className="text-[10px] text-[var(--text-faint)] -mt-2">
                Shift+Enter for new line · Ctrl+Enter or click + to save
              </div>

              {/* Notes list */}
              {state.notes.length === 0 ? (
                <div
                  className="text-sm text-[var(--text-faint)] py-8 text-center border rounded"
                  style={{ borderColor: "var(--border)" }}
                >
                  No notes yet. Add a quick thought above.
                </div>
              ) : (
                <div className="space-y-2">
                  {state.notes.map((n) => (
                    <div
                      key={n.id}
                      className="group flex items-start gap-3 border rounded-lg px-3 py-2.5"
                      style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm whitespace-pre-wrap break-words">{n.text}</p>
                        <p className="text-[10px] text-[var(--text-faint)] mt-1">
                          {new Date(n.created).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <button
                        className="icon-btn opacity-0 group-hover:opacity-100 shrink-0 mt-0.5"
                        onClick={() => deleteNote(n.id)}
                        title="Delete note"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add todo */}
              <div className="flex gap-2">
                <AutoTextarea
                  className="notion-input flex-1 text-sm"
                  placeholder="Add a to-do… (Shift+Enter for new line)"
                  value={todoText}
                  onChange={(e) => setTodoText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addTodo();
                    }
                  }}
                  style={{ borderColor: "var(--border-strong)", background: "var(--bg-subtle)" }}
                />
                <button className="btn btn-primary self-start" onClick={addTodo}>
                  <IconPlus />
                </button>
              </div>

              {/* Active todos */}
              {activeTodos.length === 0 && doneTodos.length === 0 ? (
                <div
                  className="text-sm text-[var(--text-faint)] py-8 text-center border rounded"
                  style={{ borderColor: "var(--border)" }}
                >
                  No to-dos yet. Add something to tackle today.
                </div>
              ) : (
                <>
                  {activeTodos.length === 0 ? (
                    <div className="text-sm text-[var(--text-faint)] py-4 text-center">
                      All done! 🎉
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {activeTodos.map((t) => (
                        <div
                          key={t.id}
                          className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)]"
                        >
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => toggleTodo(t.id)}
                            className="cursor-pointer shrink-0"
                          />
                          <span className="text-sm flex-1 whitespace-pre-wrap">{t.text}</span>
                          <button
                            className="icon-btn opacity-0 group-hover:opacity-100 shrink-0"
                            onClick={() => deleteTodo(t.id)}
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Done section */}
                  {doneTodos.length > 0 && (
                    <div>
                      <button
                        className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-4 mb-2 w-full"
                        onClick={() => setShowDone((v) => !v)}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            transform: showDone ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.15s",
                          }}
                        >
                          ▶
                        </span>
                        <span className="uppercase tracking-wide">
                          Done ({doneTodos.length})
                        </span>
                        {doneTodos.length > 0 && (
                          <button
                            className="ml-auto text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearDone();
                            }}
                          >
                            Clear all
                          </button>
                        )}
                      </button>
                      {showDone && (
                        <div className="space-y-1">
                          {doneTodos.map((t) => (
                            <div
                              key={t.id}
                              className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-hover)] opacity-55"
                            >
                              <input
                                type="checkbox"
                                checked={true}
                                onChange={() => toggleTodo(t.id)}
                                className="cursor-pointer shrink-0"
                              />
                              <span className="text-sm flex-1 line-through whitespace-pre-wrap">{t.text}</span>
                              <button
                                className="icon-btn opacity-0 group-hover:opacity-100 shrink-0"
                                onClick={() => deleteTodo(t.id)}
                                title="Delete"
                              >
                                <IconTrash />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
