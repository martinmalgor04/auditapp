/** Vista serializada del share de informe (#15, R8/R9): compartida server ↔ UI. */

export type ShareEstado = 'activo' | 'revocado' | 'expirado';

export type ShareView = {
  url: string;
  estado: ShareEstado;
  created_by: string;
  created_by_name: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
};
