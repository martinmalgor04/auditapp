import { describe, it, expect } from 'vitest';
import { itemStatus, sectionProgress } from '$lib/client/form/item-status';
import { nextPending } from '$lib/client/form/next-pending';

// ---------------------------------------------------------------------------
// itemStatus — R1, R2, R3, R4
// ---------------------------------------------------------------------------

describe('itemStatus', () => {
  it('retorna pendiente cuando value=null y na=false (R4)', () => {
    expect(itemStatus({ value: null, na: false })).toBe('pendiente');
  });

  it('retorna pendiente cuando value=undefined y na=false (R4)', () => {
    expect(itemStatus({ value: undefined, na: false })).toBe('pendiente');
  });

  it('retorna pendiente cuando value="" (R4)', () => {
    expect(itemStatus({ value: '', na: false })).toBe('pendiente');
  });

  it('retorna pendiente cuando value="   " (solo espacios) (R4)', () => {
    expect(itemStatus({ value: '   ', na: false })).toBe('pendiente');
  });

  it('retorna pendiente cuando value=[] (R4)', () => {
    expect(itemStatus({ value: [], na: false })).toBe('pendiente');
  });

  it('retorna pendiente cuando value tiene rows vacías (R4)', () => {
    expect(itemStatus({ value: { rows: [] }, na: false })).toBe('pendiente');
  });

  it('retorna respondido cuando na=true (R2)', () => {
    expect(itemStatus({ value: null, na: true })).toBe('respondido');
  });

  it('retorna respondido cuando value tiene contenido string (R2)', () => {
    expect(itemStatus({ value: 'texto', na: false })).toBe('respondido');
  });

  it('retorna respondido cuando value es array no vacío (R2)', () => {
    expect(itemStatus({ value: ['a', 'b'], na: false })).toBe('respondido');
  });

  it('retorna respondido cuando value es número (R2)', () => {
    expect(itemStatus({ value: 42, na: false })).toBe('respondido');
  });

  it('retorna respondido cuando value es false (booleano) (R2)', () => {
    expect(itemStatus({ value: false, na: false })).toBe('respondido');
  });

  it('retorna respondido cuando value tiene rows no vacías (R2)', () => {
    expect(
      itemStatus({ value: { rows: [{ row_id: '1', cells: {}, attachment_ids: [] }] }, na: false })
    ).toBe('respondido');
  });

  it('retorna con_observacion cuando respondido y notes no vacío (R3)', () => {
    expect(itemStatus({ value: 'texto', na: false, notes: 'alguna observacion' })).toBe(
      'con_observacion'
    );
  });

  it('retorna con_observacion cuando na=true y notes no vacío (R3)', () => {
    expect(itemStatus({ value: null, na: true, notes: 'obs' })).toBe('con_observacion');
  });

  it('retorna respondido (no con_observacion) cuando notes es null (R3)', () => {
    expect(itemStatus({ value: 'texto', na: false, notes: null })).toBe('respondido');
  });

  it('retorna respondido (no con_observacion) cuando notes es "" (R3)', () => {
    expect(itemStatus({ value: 'texto', na: false, notes: '' })).toBe('respondido');
  });

  it('retorna respondido (no con_observacion) cuando notes es "   " (solo espacios) (R3)', () => {
    expect(itemStatus({ value: 'texto', na: false, notes: '   ' })).toBe('respondido');
  });

  it('retorna pendiente aunque notes tenga contenido si value es null (R4 prioridad)', () => {
    expect(itemStatus({ value: null, na: false, notes: 'obs' })).toBe('pendiente');
  });

  it('cubre R1: las tres categorías son alcanzables', () => {
    expect(itemStatus({ value: null, na: false })).toBe('pendiente');
    expect(itemStatus({ value: 'v', na: false })).toBe('respondido');
    expect(itemStatus({ value: 'v', na: false, notes: 'obs' })).toBe('con_observacion');
  });
});

// ---------------------------------------------------------------------------
// sectionProgress — R18, R19
// ---------------------------------------------------------------------------

describe('sectionProgress', () => {
  it('retorna 0/0 para sección sin ítems (caso borde)', () => {
    expect(sectionProgress([])).toEqual({ answered: 0, total: 0 });
  });

  it('cuenta solo respondido+con_observacion (R18, R19)', () => {
    const items = [
      { value: null, na: false, notes: null },     // pendiente
      { value: 'texto', na: false, notes: null },  // respondido
      { value: 'texto', na: false, notes: 'obs' }, // con_observacion
    ];
    expect(sectionProgress(items)).toEqual({ answered: 2, total: 3 });
  });

  it('todos respondidos', () => {
    const items = [
      { value: 'a', na: false },
      { value: 'b', na: false },
    ];
    expect(sectionProgress(items)).toEqual({ answered: 2, total: 2 });
  });

  it('todos pendientes', () => {
    const items = [
      { value: null, na: false },
      { value: '', na: false },
    ];
    expect(sectionProgress(items)).toEqual({ answered: 0, total: 2 });
  });

  it('na=true cuenta como respondido (R19 consistente con R2)', () => {
    const items = [
      { value: null, na: true },
      { value: null, na: false },
    ];
    expect(sectionProgress(items)).toEqual({ answered: 1, total: 2 });
  });

  it('con_observacion cuenta como answered (R19)', () => {
    const items = [
      { value: 'v', na: false, notes: 'obs' },
      { value: null, na: false, notes: 'obs but pendiente' },
    ];
    expect(sectionProgress(items)).toEqual({ answered: 1, total: 2 });
  });
});

// ---------------------------------------------------------------------------
// nextPending — R9, R10, R11, R12, R13
// ---------------------------------------------------------------------------

const makeItem = (id: string, value: unknown = null, na = false, notes: string | null = null) => ({
  id,
  value,
  na,
  notes
});

const makeSec = (id: string, items: ReturnType<typeof makeItem>[]) => ({ id, items });

describe('nextPending', () => {
  it('retorna ítem en sección activa cuando existe pendiente (R9)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1', 'v'), makeItem('i2')]),
    ];
    const result = nextPending(sections, 0, 0);
    expect(result).toMatchObject({ sectionId: 's1', itemId: 'i2' });
  });

  it('salta a siguiente sección cuando la activa no tiene pendientes (R10)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1', 'v')]),
      makeSec('s2', [makeItem('i2')]),
    ];
    const result = nextPending(sections, 0, 0);
    expect(result).toMatchObject({ sectionId: 's2', itemId: 'i2' });
  });

  it('retorna null cuando no hay ningún pendiente en ninguna sección (R11)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1', 'v')]),
      makeSec('s2', [makeItem('i2', 'v')]),
    ];
    expect(nextPending(sections, 0, -1)).toBeNull();
  });

  it('búsqueda circular desde última sección hacia secciones anteriores (R12)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1')]),  // pendiente
      makeSec('s2', [makeItem('i2', 'v')]), // respondido
    ];
    // Activo s2 (index 1), ningún pendiente en s2 → busca en s1 (circular)
    const result = nextPending(sections, 1, -1);
    expect(result).toMatchObject({ sectionId: 's1', itemId: 'i1' });
  });

  it('búsqueda circular: vuelve al inicio cuando activo es la última sección (R12)', () => {
    const sections = [
      makeSec('s1', [makeItem('p1')]),    // pendiente
      makeSec('s2', [makeItem('r2', 'v')]), // respondido
      makeSec('s3', [makeItem('r3', 'v')]), // respondido
    ];
    const result = nextPending(sections, 2, -1);
    expect(result).toMatchObject({ sectionId: 's1', itemId: 'p1' });
  });

  it('dentro de la sección activa busca desde lastVisitedItemIndex+1 (R9)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1'), makeItem('i2'), makeItem('i3')]),
    ];
    // lastVisited = 0 → busca desde i1+1 = i2
    const result = nextPending(sections, 0, 0);
    expect(result).toMatchObject({ itemId: 'i2' });
  });

  it('si todos los siguientes están respondidos, busca desde el inicio de la sección activa (R12)', () => {
    const sections = [
      makeSec('s1', [makeItem('i1'), makeItem('i2', 'v'), makeItem('i3', 'v')]),
    ];
    // lastVisited = 0 → i2 respondido, i3 respondido → vuelve al principio → i1
    // Primero busca i2..i3 (respondidos), luego otras secciones (ninguna), luego i1..i0 de activa
    const result = nextPending(sections, 0, 0);
    // i1 (index 0) está antes de lastVisited (0), pero i2 y i3 están respondidos
    // El algoritmo busca desde lastVisited+1=1 (i2 respondido, i3 respondido),
    // luego circular (no hay otras secciones), luego desde 0..0 = i1
    expect(result).toMatchObject({ itemId: 'i1' });
  });

  it('función pura: no hace I/O ni tiene efectos secundarios (R13)', () => {
    // Verificar que la función es determinista y no lanza
    const sections = [makeSec('s1', [makeItem('i1', 'v')])];
    const r1 = nextPending(sections, 0, -1);
    const r2 = nextPending(sections, 0, -1);
    expect(r1).toEqual(r2);
  });

  it('sección sin ítems es omitida correctamente (caso borde R10)', () => {
    const sections = [
      makeSec('s1', []),
      makeSec('s2', [makeItem('i1')]),
    ];
    const result = nextPending(sections, 0, -1);
    expect(result).toMatchObject({ sectionId: 's2', itemId: 'i1' });
  });
});

// ---------------------------------------------------------------------------
// Consistencia de progreso con itemStatus — R6, R19, R23
// ---------------------------------------------------------------------------

describe('sectionProgress consistency with itemStatus', () => {
  it('sectionProgress usa la misma definición que itemStatus para respondido (R19, R23)', () => {
    const items = [
      { value: 'a', na: false, notes: null },
      { value: 'b', na: false, notes: 'obs' },
      { value: null, na: true, notes: null },
      { value: null, na: false, notes: null },
    ];
    const { answered } = sectionProgress(items);
    const manualCount = items.filter((it) => itemStatus(it) !== 'pendiente').length;
    expect(answered).toBe(manualCount);
  });

  it('estado derivado cambia al cambiar value (R6, verificado con función pura)', () => {
    const item = { value: null as unknown, na: false, notes: null };
    expect(itemStatus(item)).toBe('pendiente');
    item.value = 'nuevo valor';
    expect(itemStatus(item)).toBe('respondido');
  });

  it('estado derivado cambia al cambiar na (R6)', () => {
    const item = { value: null as unknown, na: false, notes: null };
    expect(itemStatus(item)).toBe('pendiente');
    item.na = true;
    expect(itemStatus(item)).toBe('respondido');
  });

  it('estado derivado cambia al cambiar notes (R6)', () => {
    const item = { value: 'v' as unknown, na: false, notes: null as string | null };
    expect(itemStatus(item)).toBe('respondido');
    item.notes = 'alguna observacion';
    expect(itemStatus(item)).toBe('con_observacion');
  });
});
