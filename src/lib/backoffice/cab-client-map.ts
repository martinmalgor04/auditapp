export type ClientCabFields = {
  razonSocial: string;
  cuit: string | null;
  rubro: string | null;
  empleados: number | null;
  referenteNombre: string | null;
  referenteContacto: string | null;
  erpActual: string | null;
  proveedorCorreo: string | null;
  soporteItActual: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
};

export type CabItemRef = {
  id: string;
  label: string;
  fieldType: string;
};

const LABEL_TO_FIELD: Record<string, keyof ClientCabFields | 'scheduledAt'> = {
  'razón social': 'razonSocial',
  cuit: 'cuit',
  'rubro / actividad': 'rubro',
  'cantidad de empleados': 'empleados',
  'referente principal': 'referenteNombre',
  'contacto referente': 'referenteContacto',
  'erp actual': 'erpActual',
  'proveedor de correo': 'proveedorCorreo',
  'soporte it actual': 'soporteItActual',
  'dirección': 'direccion',
  'teléfono': 'telefono',
  'email': 'email',
  'fecha programada de visita': 'scheduledAt'
};

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function formatScheduledAt(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function fieldValue(
  client: ClientCabFields,
  field: keyof ClientCabFields | 'scheduledAt',
  scheduledAt?: string | Date | null
): unknown {
  if (field === 'scheduledAt') {
    return formatScheduledAt(scheduledAt);
  }
  return client[field];
}

export function isEmptyCabValue(value: unknown): boolean {
  if (value === null || value === undefined || value === 'null') return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function clientToCabValues(
  client: ClientCabFields,
  cabItems: CabItemRef[],
  scheduledAt?: string | Date | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const item of cabItems) {
    const field = LABEL_TO_FIELD[normalizeLabel(item.label)];
    if (!field) continue;

    const raw = fieldValue(client, field, scheduledAt);
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;

    out[item.id] = raw;
  }

  return out;
}

export function mergeCabResponses(
  defaults: Record<string, unknown>,
  provided: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...defaults };

  for (const [itemId, value] of Object.entries(provided)) {
    if (!isEmptyCabValue(value)) {
      merged[itemId] = value;
    }
  }

  return merged;
}

export function cabResponsesToClientPatch(
  cabItems: CabItemRef[],
  cabResponses: Record<string, unknown>
): Partial<ClientCabFields> {
  const patch: Partial<ClientCabFields> = {};
  const itemsById = new Map(cabItems.map((item) => [item.id, item]));

  for (const [itemId, value] of Object.entries(cabResponses)) {
    if (isEmptyCabValue(value)) continue;

    const item = itemsById.get(itemId);
    if (!item) continue;

    const field = LABEL_TO_FIELD[normalizeLabel(item.label)];
    if (!field || field === 'scheduledAt') continue;

    if (field === 'empleados') {
      const n = typeof value === 'number' ? value : Number(String(value));
      patch.empleados = Number.isFinite(n) ? n : null;
      continue;
    }

    patch[field] = String(value);
  }

  return patch;
}

export function newClientToCabFields(newClient: {
  razonSocial: string;
  cuit?: string;
  rubro?: string;
}): ClientCabFields {
  return {
    razonSocial: newClient.razonSocial,
    cuit: newClient.cuit || null,
    rubro: newClient.rubro || null,
    empleados: null,
    referenteNombre: null,
    referenteContacto: null,
    erpActual: null,
    proveedorCorreo: null,
    soporteItActual: null,
    direccion: null,
    telefono: null,
    email: null
  };
}

export function applyCabDefaultsToItems<T extends CabItemRef & { value?: unknown }>(
  items: T[],
  client: ClientCabFields,
  scheduledAt?: string | Date | null
): T[] {
  const defaults = clientToCabValues(client, items, scheduledAt);

  return items.map((item) => ({
    ...item,
    value: isEmptyCabValue(item.value) ? (defaults[item.id] ?? item.value) : item.value
  }));
}
