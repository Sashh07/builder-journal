export type SessionType =
  | "python"
  | "prompt"
  | "automation"
  | "usecase"
  | "brainstorm"
  | "reflection"
  | "other";

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
  customTasks?: (string[] | null)[]; // length 8; null = use default tasks for that week
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
  reflection: Reflection;
  reflectionLog: ReflectionEntry[];
  focus: string;
  notes: Note[];
  todos: Todo[];
}

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  python: "Python",
  prompt: "Prompt engineering",
  automation: "Make.com / automation",
  usecase: "Use case / business",
  brainstorm: "Brainstorm",
  reflection: "Reflection",
  other: "Other",
};

export const SESSION_TYPE_TAG: Record<SessionType, { label: string; color: string }> = {
  python:     { label: "Python",     color: "purple" },
  prompt:     { label: "Prompt",     color: "blue" },
  automation: { label: "Automation", color: "teal" },
  usecase:    { label: "Use case",   color: "amber" },
  brainstorm: { label: "Brainstorm", color: "coral" },
  reflection: { label: "Reflection", color: "pink" },
  other:      { label: "Other",      color: "gray" },
};

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
