import { useEffect, useState } from "react";
import type { AppState, Session } from "./types";
import { loadKey, saveKey, removeKey, STORAGE_KEYS } from "./storage";
import { SEED } from "./seed";

export function useAppState() {
  const [state, setState] = useState<AppState>(SEED);
  const [loaded, setLoaded] = useState(false);

  // Load
  useEffect(() => {
    let active = true;
    (async () => {
      const [sessions, ideas, blockers, python, phase, reflection, reflectionLog, focus, notes, todos] = await Promise.all([
        loadKey("sessions", SEED.sessions),
        loadKey("ideas", SEED.ideas),
        loadKey("blockers", SEED.blockers),
        loadKey("python", SEED.python),
        loadKey("phase", SEED.phase),
        loadKey("reflection", SEED.reflection),
        loadKey("reflectionLog", SEED.reflectionLog),
        loadKey("focus", SEED.focus),
        loadKey("notes", SEED.notes),
        loadKey("todos", SEED.todos),
      ]);
      if (!active) return;
      setState({ sessions, ideas, blockers, python, phase, reflection, reflectionLog, focus, notes, todos });
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Granular setters that also persist
  const update = <K extends keyof AppState>(key: K, val: AppState[K]) => {
    setState((s) => ({ ...s, [key]: val }));
    saveKey(key, val);
  };

  const addSession = (s: Session) => {
    const next = [s, ...state.sessions];
    update("sessions", next);
  };
  const deleteSession = (id: string) => {
    update("sessions", state.sessions.filter((s) => s.id !== id));
  };
  const updateSession = (id: string, patch: Partial<Session>) => {
    update(
      "sessions",
      state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const resetAll = () => {
    STORAGE_KEYS.forEach(removeKey);
    setState(SEED);
  };

  return {
    state,
    loaded,
    update,
    addSession,
    deleteSession,
    updateSession,
    resetAll,
  };
}

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    (async () => {
      const t = await loadKey<"light" | "dark">("theme", "light");
      setTheme(t);
    })();
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveKey("theme", theme);
  }, [theme]);
  return { theme, setTheme };
}

export function currentPhaseWeek(startDate: string): number {
  // Returns 1..8 if within the 8-week window, 0 if before, 9 if after.
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 0;
  const week = Math.floor(days / 7) + 1;
  if (week > 8) return 9;
  return week;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sessionsThisWeek(sessions: Session[]): Session[] {
  const start = startOfWeek(new Date());
  return sessions.filter((s) => new Date(s.date) >= start);
}

export function sessionsLastNDays(sessions: Session[], n: number): Session[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - n + 1);
  return sessions.filter((s) => new Date(s.date) >= start);
}
