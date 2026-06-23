import {
  DRAFT_STORE_NAME,
  openFormDb
} from './retry-queue';

export type DraftResponses = Record<
  string,
  { value: unknown; na: boolean; notes: string | null }
>;

export type FormDraft = {
  auditId: string;
  savedAt: string;
  responses: DraftResponses;
};

const STORE_NAME = DRAFT_STORE_NAME;

/** Abre (o actualiza) la IDB compartida (`DB_NAME`, versión `DB_VERSION`). */
function openDb(): Promise<IDBDatabase> {
  return openFormDb();
}

/** Guarda o reemplaza el draft para auditId. No lanza; loguea en warn si falla. */
export async function saveDraft(draft: FormDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[draft-store] saveDraft failed', err);
  }
}

/** Devuelve el draft almacenado o null si no existe. */
export async function loadDraft(auditId: string): Promise<FormDraft | null> {
  const db = await openDb();
  const draft = await new Promise<FormDraft | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(auditId);
    req.onsuccess = () => resolve((req.result as FormDraft | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return draft;
}

/** Elimina el draft. No lanza si no existe. */
export async function deleteDraft(auditId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(auditId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[draft-store] deleteDraft failed', err);
  }
}
