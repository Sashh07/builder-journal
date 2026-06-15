// ─── Supabase-backed storage for Builder's Journal ───────────────────────────
const SUPABASE_URL = "https://ifsjujdwcdivbmjbryaw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dqIF982RCKc3iB4e7G7qxw_96IaYBgW";
const OWNER_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Prefer": "resolution=merge-duplicates",
};

export type SyncStatus = "idle" | "saving" | "saved" | "error";

function emitSync(status: SyncStatus) {
  window.dispatchEvent(new CustomEvent("journal:sync", { detail: status }));
}

async function sbGet(key: string): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/journal_data?owner_id=eq.${OWNER_ID}&key=eq.${key}&select=value`,
      { headers: HEADERS }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].value;
  } catch {
    return null;
  }
}

async function sbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/journal_data?on_conflict=owner_id,key`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ owner_id: OWNER_ID, key, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function initStorage() {
  // No-op: kept for API compatibility with state.ts
}

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  const val = await sbGet(key);
  if (val === null || val === undefined) return fallback;
  return val as T;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function saveKey<T>(key: string, value: T): void {
  if (saveTimers.has(key)) clearTimeout(saveTimers.get(key)!);
  emitSync("saving");
  const timer = setTimeout(async () => {
    saveTimers.delete(key);
    const ok = await sbSet(key, value);
    emitSync(ok ? "saved" : "error");
    if (ok) {
      try { localStorage.setItem(`journey:${key}`, JSON.stringify(value)); } catch { }
    }
  }, 800);
  saveTimers.set(key, timer);
}

export function removeKey(key: string): void {
  fetch(`${SUPABASE_URL}/rest/v1/journal_data?owner_id=eq.${OWNER_ID}&key=eq.${key}`, {
    method: "DELETE",
    headers: HEADERS,
  }).catch(() => { });
  try { localStorage.removeItem(`journey:${key}`); } catch { }
}

export async function exportAllData(): Promise<string> {
  const data: Record<string, unknown> = {};
  await Promise.all(
    STORAGE_KEYS.map(async (key) => {
      const val = await sbGet(key);
      if (val !== null) data[key] = val;
    })
  );
  return JSON.stringify(data, null, 2);
}

export type ImportResult =
  | { ok: true; keysImported: string[] }
  | { ok: false; error: string };

export async function importAllData(json: string): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "File is not valid JSON" };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Backup file is not a journal export (expected an object)" };
  }
  const knownKeys = new Set<string>(STORAGE_KEYS);
  const keysToImport = Object.keys(data as Record<string, unknown>).filter((k) =>
    knownKeys.has(k as (typeof STORAGE_KEYS)[number])
  );
  if (keysToImport.length === 0) {
    return { ok: false, error: "Backup file contains no recognizable journal data" };
  }
  emitSync("saving");
  const results = await Promise.all(
    keysToImport.map((key) => sbSet(key, (data as Record<string, unknown>)[key]))
  );
  const allOk = results.every(Boolean);
  emitSync(allOk ? "saved" : "error");
  return { ok: true, keysImported: keysToImport };
}

async function readFromIndexedDB(key: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    try {
      const openReq = indexedDB.open("journey_db", 1);
      openReq.onerror = () => resolve(null);
      openReq.onsuccess = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains("data")) { db.close(); resolve(null); return; }
        try {
          const tx = db.transaction("data", "readonly");
          const req = tx.objectStore("data").get(`journey:${key}`);
          req.onsuccess = () => {
            const raw = req.result?.value;
            db.close();
            if (raw == null) { resolve(null); return; }
            try { resolve(JSON.parse(raw)); } catch { resolve(null); }
          };
          req.onerror = () => { db.close(); resolve(null); };
        } catch { db.close(); resolve(null); }
      };
    } catch { resolve(null); }
  });
}

function readFromLocalStorage(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(`journey:${key}`);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export async function migrateLocalToSupabase(): Promise<{ migrated: number; keys: string[] }> {
  const migrated: string[] = [];
  for (const key of STORAGE_KEYS) {
    try {
      let parsed = await readFromIndexedDB(key);
      if (parsed === null) parsed = readFromLocalStorage(key);
      if (parsed === null) continue;
      const existing = await sbGet(key);
      if (existing !== null) continue;
      const ok = await sbSet(key, parsed);
      if (ok) migrated.push(key);
    } catch { }
  }
  return { migrated: migrated.length, keys: migrated };
}

export const STORAGE_KEYS = [
  "sessions",
  "ideas",
  "blockers",
  "python",
  "phase",
  "reflection",
  "reflectionLog",
  "focus",
  "notes",
  "todos",
  "sessionTypes",
  "prompt",
  "theme",
] as const;
