/**
 * Bid memory and uploads for the mock API, kept in this browser. Memory survives reloads
 * (localStorage), like the mock's drafts; uploaded bytes live only for the page's lifetime,
 * because an 8 MB PDF does not fit in localStorage.
 */
import type { BidMemory, BidStage, MemoryNote, SessionFile } from "./api";

const MEMORY_KEY = "kopi.mockMemory";
const UPLOADS_KEY = "kopi.mockUploads";

type Stored<T> = Record<string, T>;

function read<T>(key: string): Stored<T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Stored<T>;
  } catch {
    return {};
  }
}

function write<T>(key: string, value: Stored<T>) {
  localStorage.setItem(key, JSON.stringify(value));
}

const EMPTY: BidMemory = { notes: [], stage: null, next_step: null, updated: null };

export function readMemory(session: string): BidMemory {
  return read<BidMemory>(MEMORY_KEY)[session] ?? EMPTY;
}

function update(session: string, change: (memory: BidMemory) => Partial<BidMemory>): BidMemory {
  const all = read<BidMemory>(MEMORY_KEY);
  const current = all[session] ?? EMPTY;
  all[session] = { ...current, ...change(current), updated: new Date().toISOString() };
  write(MEMORY_KEY, all);
  return all[session];
}

export function addNote(session: string, text: string, source: MemoryNote["source"]): BidMemory {
  const note: MemoryNote = { id: Math.random().toString(36).slice(2, 14), text, source, created: new Date().toISOString() };
  return update(session, (m) => ({ notes: [...m.notes, note] }));
}

export function dropNote(session: string, id: string): BidMemory | null {
  const current = readMemory(session);
  if (!current.notes.some((n) => n.id === id)) return null;
  return update(session, (m) => ({ notes: m.notes.filter((n) => n.id !== id) }));
}

export function setStage(session: string, stage: BidStage, next: string | null): BidMemory {
  return update(session, () => ({ stage, next_step: next }));
}

// ---------------------------------------------------------------- uploads

const bodies = new Map<string, string>();

export async function keepUpload(session: string, file: File): Promise<SessionFile> {
  const text = /\.(md|txt|csv)$/i.test(file.name) ? await file.text() : `${file.name} (${file.size.toLocaleString("en-SG")} bytes, kept in this tab)`;
  bodies.set(`${session}/${file.name}`, text);
  const entry: SessionFile = { name: file.name, title: file.name, size: file.size, modified: new Date().toISOString(), kind: "upload" };
  const all = read<Record<string, SessionFile>>(UPLOADS_KEY);
  all[session] = { ...all[session], [file.name]: entry };
  write(UPLOADS_KEY, all);
  return entry;
}

export function listUploads(session: string): SessionFile[] {
  return Object.values(read<Record<string, SessionFile>>(UPLOADS_KEY)[session] ?? {});
}

export function uploadBody(session: string, name: string): string | undefined {
  if (!listUploads(session).some((f) => f.name === name)) return undefined;
  return bodies.get(`${session}/${name}`) ?? `${name} was uploaded in an earlier tab; the mock keeps upload contents only while the tab is open.`;
}
