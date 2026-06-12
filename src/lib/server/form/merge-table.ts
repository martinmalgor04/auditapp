/**
 * Red de seguridad server-side para values de tabla.
 *
 * Decisión de diseño: NO rechazamos un payload con menos filas que el guardado
 * (borrar filas es un caso legítimo del form). Lo que sí garantizamos es que un
 * PATCH nunca pueda "des-asociar" fotos ya confirmadas de una fila que sigue
 * existiendo: para cada row_id presente en ambos lados, los attachment_ids
 * resultantes son la UNIÓN de los guardados y los entrantes. Así, un cliente
 * con estado viejo (el bug del snapshot del load) no pierde los links de fotos
 * de las filas que conserva, y el fix client-side evita la pérdida de filas.
 */

type TableRow = {
  row_id: string;
  cells: Record<string, unknown>;
  attachment_ids: string[];
};

type TableValue = { rows: TableRow[] };

function isTableValue(v: unknown): v is TableValue {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { rows?: unknown }).rows)
  );
}

export function mergeTableAttachmentIds(existing: unknown, incoming: unknown): unknown {
  if (!isTableValue(incoming) || !isTableValue(existing)) {
    return incoming;
  }

  const existingById = new Map(existing.rows.map((r) => [r.row_id, r]));

  return {
    ...incoming,
    rows: incoming.rows.map((row) => {
      const prev = existingById.get(row.row_id);
      if (!prev) return row;
      const incomingIds = Array.isArray(row.attachment_ids) ? row.attachment_ids : [];
      const prevIds = Array.isArray(prev.attachment_ids) ? prev.attachment_ids : [];
      const union = [...incomingIds];
      for (const id of prevIds) {
        if (!union.includes(id)) union.push(id);
      }
      return { ...row, attachment_ids: union };
    })
  };
}
