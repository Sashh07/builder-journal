import type { AppState } from "./types";
import { DEFAULT_SESSION_TYPES, PHASE2_LENGTH } from "./types";

function startOfWeekISO(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const SEED: AppState = {
  focus: "Build first real Make.com automation",
  sessions: [],
  ideas: [
    {
      id: "seed-reddit",
      title: "Reddit Extractor",
      why: "Helps research problems on Reddit — surface real customer pain to validate use cases",
      next: "Learn APIs and context management",
      deps: "Python / APIs",
      status: "Researching",
      created: new Date().toISOString(),
    },
  ],
  blockers: [],
  python: {
    level: "Beginner",
    topic: "Loops and list comprehensions",
    knows: [
      { id: "k1", text: "Variables and data types" },
      { id: "k2", text: "for / while loops" },
      { id: "k3", text: "if / else" },
      { id: "k4", text: "Function basics" },
      { id: "k5", text: "Basic list operations" },
    ],
    wins: [{ id: "w1", text: "Built a simple calculator" }],
  },
  phase: {
    startDate: startOfWeekISO(),
    done: [false, false, false, false, false, false, false, false],
  },
  phase2: {
    startDate: startOfWeekISO(),
    done: new Array(PHASE2_LENGTH).fill(false),
  },
  weeklyMetrics: [],
  reflection: {
    feeling: "Excited but overwhelmed.",
    challenge: "Staying consistent.",
    breakthrough: "Realizing Python isn't as intuitive as advertised — it's a real skill that takes deliberate practice.",
    next: "Ship one Make.com automation end-to-end.",
  },
  reflectionLog: [],
  notes: [],
  todos: [],
  sessionTypes: DEFAULT_SESSION_TYPES,
};
