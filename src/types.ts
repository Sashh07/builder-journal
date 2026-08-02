// Session types are now user-editable runtime data, not a fixed union.
// A SessionType is just the stored `id` of a CustomSessionType. Historical
// sessions keep their stored id even if the type is later renamed or deleted
// (graceful-orphan: TypeTag falls back to a neutral tag rendering the id).
export type SessionType = string;

export interface CustomSessionType {
  id: string;      // stable key stored on sessions, e.g. "python"
  label: string;   // display name, e.g. "Python"
  color: string;   // one of TAG_COLORS (maps to --tag-<color>-bg / -fg)
}

// The palette available for tags. Each must have matching --tag-<name>-bg
// and --tag-<name>-fg vars defined in index.css (light + dark).
export const TAG_COLORS = [
  "purple", "blue", "teal", "amber", "coral", "pink", "gray", "green",
  "indigo", "rose", "lime", "cyan", "orange", "violet", "slate", "gold",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

// Default session types — seeds a fresh install and used as fallback when no
// custom list has been saved yet. Mirrors the original hardcoded set.
export const DEFAULT_SESSION_TYPES: CustomSessionType[] = [
  { id: "python",     label: "Python",                 color: "purple" },
  { id: "prompt",     label: "Prompt engineering",     color: "blue" },
  { id: "automation", label: "Make.com / automation",  color: "teal" },
  { id: "usecase",    label: "Use case / business",    color: "amber" },
  { id: "brainstorm", label: "Brainstorm",             color: "coral" },
  { id: "reflection", label: "Reflection",             color: "pink" },
  { id: "other",      label: "Other",                  color: "gray" },
];

export type Mood =
  | "Energized"
  | "Focused"
  | "Neutral"
  | "Frustrated"
  | "Overwhelmed"
  | "Breakthrough";

export interface Session {
  id: string;
  date: string; // ISO
  type: SessionType;
  mood: Mood;
  entry: string;
  win: boolean;
}

export type IdeaStatus = "Active" | "Researching" | "Paused" | "Shipped";

export interface Idea {
  id: string;
  title: string;
  why: string;
  next: string;
  deps: string;
  status: IdeaStatus;
  created: string;
  archived?: boolean;
  priority?: number; // lower number = higher priority within its status column. Backfilled lazily.
}

export interface Blocker {
  id: string;
  text: string;
  added: string; // ISO date
}

export type PythonLevel =
  | "Beginner"
  | "Beginner+"
  | "Intermediate"
  | "Intermediate+"
  | "Advanced";

export interface PythonState {
  level: PythonLevel;
  topic: string;
  knows: { id: string; text: string }[];
  wins: { id: string; text: string }[];
}

export interface PhaseState {
  startDate: string; // ISO date marking week 1 start
  done: boolean[]; // length 8
  customThemes?: (string | null)[]; // length 8; null = use default
  customTasks?: (string[] | null)[]; // length 8; null = use default
}

// Phase 2 — independent AI consulting, 12 weeks. Stored under its own key so
// Phase 1 data (`phase`) is never migrated or mutated. Same shape as
// PhaseState but 12 slots instead of 8.
export interface Phase2State {
  startDate: string; // ISO date marking week 1 start
  done: boolean[]; // length 12
  customThemes?: (string | null)[]; // length 12; null = use default
  customTasks?: (string[] | null)[]; // length 12; null = use default
}

export const PHASE2_LENGTH = 12;

// The four numbers from the Sunday review, logged per week. `lesson` is the
// one-sentence answer to "what did a client conversation teach me that the
// roadmap got wrong?" — kept here so the review has somewhere to land.
export interface WeekMetric {
  id: string;
  weekStart: string; // ISO date of Monday of that week
  proposals: number;
  replies: number;
  calls: number;
  invoiced: number; // USD
  lesson: string;
  saved: string; // ISO timestamp
}

export interface Reflection {
  feeling: string;
  challenge: string;
  breakthrough: string;
  next: string;
}

export interface ReflectionEntry {
  id: string;
  weekStart: string; // ISO date of Monday of that week
  feeling: string;
  challenge: string;
  breakthrough: string;
  next: string;
  saved: string; // ISO timestamp when locked in
}

export interface Note {
  id: string;
  text: string;
  created: string; // ISO
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  created: string; // ISO
  completedAt?: string; // ISO
}

export interface AppState {
  sessions: Session[];
  ideas: Idea[];
  blockers: Blocker[];
  python: PythonState;
  phase: PhaseState;
  phase2: Phase2State;
  weeklyMetrics: WeekMetric[];
  reflection: Reflection;
  reflectionLog: ReflectionEntry[];
  focus: string;
  notes: Note[];
  todos: Todo[];
  sessionTypes: CustomSessionType[];
}

// ─── Session type resolvers ──────────────────────────────────────────────────
// These replace the old static SESSION_TYPE_LABELS / SESSION_TYPE_TAG maps.
// They take the runtime list (state.sessionTypes) and resolve a stored id to a
// label/color. If the id has no matching type (renamed or deleted = orphan),
// they fall back to a neutral gray tag showing the raw id, so history never
// breaks and nothing renders blank.

export function resolveSessionType(
  types: CustomSessionType[],
  id: SessionType
): CustomSessionType {
  const found = types.find((t) => t.id === id);
  if (found) return found;
  return { id, label: id, color: "gray" }; // graceful orphan
}

export function sessionTypeLabel(
  types: CustomSessionType[],
  id: SessionType
): string {
  return resolveSessionType(types, id).label;
}

export const MOODS: Mood[] = [
  "Energized",
  "Focused",
  "Neutral",
  "Frustrated",
  "Overwhelmed",
  "Breakthrough",
];

export const PHASE_WEEKS: { title: string; theme: string }[] = [
  { title: "Week 1", theme: "Foundation — finish DeepLearning.AI, build first Make.com automation, start CS50P" },
  { title: "Week 2", theme: "Prompt engineering depth — finish Anthropic tutorial, build prompt library, ship automation #2" },
  { title: "Week 3", theme: "Apply and experiment — build automation #3, deepen tool comparison, start thinking about first client" },
  { title: "Week 4", theme: "Ship something real — complete one end-to-end automation that solves a real problem" },
  { title: "Week 5", theme: "Business problems week 1 — identify 1 real business, map problem to AI solution" },
  { title: "Week 6", theme: "Business problems week 2 — build prototype, refine, prepare to demo" },
  { title: "Week 7", theme: "Python in the morning — Python moves to morning block, reach out to 1 business" },
  { title: "Week 8", theme: "Transition to Phase 2 — Reddit Extractor MVP, refine client prototype, set Phase 2 roadmap" },
];
