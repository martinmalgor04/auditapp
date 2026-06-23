import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DB_NAME,
  DB_VERSION,
  DRAFT_STORE_NAME,
  enqueueSave,
  listQueued,
  openFormDb
} from '../src/lib/client/form/retry-queue';
import {
  deleteDraft,
  loadDraft,
  saveDraft,
  type FormDraft
} from '../src/lib/client/form/draft-store';

const auditId = '00000000-0000-4000-8000-000000000001';

function sampleDraft(savedAt: string): FormDraft {
  return {
    auditId,
    savedAt,
    responses: {
      'item-1': { value: 'a', na: false, notes: null },
      'item-2': { value: null, na: true, notes: 'nota' }
    }
  };
}

async function resetDraftDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('draft-store', () => {
  beforeEach(async () => {
    await resetDraftDb();
  });

  afterEach(async () => {
    await resetDraftDb();
  });

  it('saveDraft crea documento con savedAt ISO', async () => {
    const savedAt = new Date().toISOString();
    await saveDraft(sampleDraft(savedAt));

    const db = await openFormDb();
    const stored = await new Promise<FormDraft | undefined>((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE_NAME, 'readonly');
      const req = tx.objectStore(DRAFT_STORE_NAME).get(auditId);
      req.onsuccess = () => resolve(req.result as FormDraft | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();

    expect(stored?.savedAt).toBe(savedAt);
    expect(stored?.responses['item-1']?.value).toBe('a');
    expect(Number.isNaN(Date.parse(stored?.savedAt ?? ''))).toBe(false);
  });

  it('saveDraft sobreescribe el draft existente para el mismo auditId', async () => {
    await saveDraft(sampleDraft('2026-06-23T10:00:00.000Z'));
    await saveDraft({
      auditId,
      savedAt: '2026-06-23T11:00:00.000Z',
      responses: { 'item-1': { value: 'b', na: false, notes: null } }
    });

    const loaded = await loadDraft(auditId);
    expect(loaded?.savedAt).toBe('2026-06-23T11:00:00.000Z');
    expect(loaded?.responses['item-1']?.value).toBe('b');
    expect(loaded?.responses['item-2']).toBeUndefined();
  });

  it('loadDraft devuelve null cuando no hay draft', async () => {
    expect(await loadDraft(auditId)).toBeNull();
  });

  it('loadDraft devuelve el draft guardado', async () => {
    const draft = sampleDraft('2026-06-23T12:00:00.000Z');
    await saveDraft(draft);
    expect(await loadDraft(auditId)).toEqual(draft);
  });

  it('deleteDraft elimina el draft y loadDraft devuelve null', async () => {
    await saveDraft(sampleDraft('2026-06-23T13:00:00.000Z'));
    await deleteDraft(auditId);
    expect(await loadDraft(auditId)).toBeNull();
  });

  it('saveDraft loguea warn y no lanza si falla la escritura', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const openSpy = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const req = {
        onsuccess: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        onupgradeneeded: null as ((ev: IDBVersionChangeEvent) => void) | null,
        error: new DOMException('quota exceeded', 'QuotaExceededError'),
        result: null as IDBDatabase | null
      } as unknown as IDBOpenDBRequest;

      queueMicrotask(() => req.onerror?.(new Event('error')));
      return req;
    });

    await expect(
      saveDraft(sampleDraft('2026-06-23T14:00:00.000Z'))
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    openSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('abre auditapp_form en versión 2 con store form_draft', async () => {
    const db = await openFormDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains(DRAFT_STORE_NAME)).toBe(true);
    db.close();
  });

  it('R17: draft y retry-queue son independientes en IDB', async () => {
    const draft: FormDraft = {
      auditId,
      savedAt: '2026-06-23T17:00:00.000Z',
      responses: { 'item-1': { value: 'local', na: false, notes: null } }
    };
    await saveDraft(draft);
    expect(await loadDraft(auditId)).not.toBeNull();
    expect(await listQueued(auditId)).toHaveLength(0);

    await enqueueSave({
      auditId,
      itemId: 'item-2',
      value: 'offline',
      na: false,
      notes: null,
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    });
    expect(await listQueued(auditId)).toHaveLength(1);
    expect(await loadDraft(auditId)).not.toBeNull();
  });
});
