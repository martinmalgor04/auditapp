import type { PatchOutcome, SavePayload } from './autosave';

/** Acepta boolean legado (true=saved, false=offline) o el PatchOutcome nuevo. */
export type PatchFn = (payload: SavePayload) => Promise<boolean | PatchOutcome>;

const DB_NAME = 'auditapp_form';
const STORE_NAME = 'form_retry_queue';
const DB_VERSION = 1;

export type QueuedSave = SavePayload & {
  auditId: string;
  enqueuedAt: string;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ['auditId', 'itemId'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSave(entry: QueuedSave): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listQueued(auditId: string): Promise<QueuedSave[]> {
  const db = await openDb();
  const all = await new Promise<QueuedSave[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedSave[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.filter((e) => e.auditId === auditId);
}

export async function removeQueued(auditId: string, itemId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete([auditId, itemId]);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Lógica pura de flush, testeable sin IndexedDB. */
export async function flushEntries(
  auditId: string,
  entries: QueuedSave[],
  patchFn: PatchFn,
  removeFn: (auditId: string, itemId: string) => Promise<void>
): Promise<number> {
  let flushed = 0;

  for (const entry of entries) {
    const result = await patchFn({
      itemId: entry.itemId,
      value: entry.value,
      na: entry.na,
      notes: entry.notes
    });
    const saved = result === true || result === 'saved';
    if (saved || result === 'rejected') {
      // 'rejected' (4xx): el server nunca lo va a aceptar — se saca de la cola
      // para no reintentar infinitamente contra el mismo error.
      await removeFn(auditId, entry.itemId);
    }
    if (saved) flushed++;
  }

  return flushed;
}

export async function flushQueue(auditId: string, patchFn: PatchFn): Promise<number> {
  const entries = await listQueued(auditId);
  const flushed = await flushEntries(auditId, entries, patchFn, removeQueued);

  return flushed;
}

export function registerOnlineFlush(
  auditId: string,
  patchFn: PatchFn,
  onFlushed?: (count: number) => void
): () => void {
  const handler = () => {
    void flushQueue(auditId, patchFn).then(onFlushed);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }
  return () => {};
}

/** In-memory fallback for tests without IndexedDB. */
let memoryQueue: QueuedSave[] = [];

export function _resetMemoryQueueForTests(): void {
  memoryQueue = [];
}

export async function enqueueSaveMemory(entry: QueuedSave): Promise<void> {
  memoryQueue = memoryQueue.filter(
    (e) => !(e.auditId === entry.auditId && e.itemId === entry.itemId)
  );
  memoryQueue.push(entry);
}

export function listQueuedMemory(auditId: string): QueuedSave[] {
  return memoryQueue.filter((e) => e.auditId === auditId);
}
