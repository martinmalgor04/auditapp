import { InformeInvalidTransitionError } from './errors';

export type InformeStatus = 'pendiente' | 'generando' | 'borrador' | 'aprobado' | 'error';

export const INFORME_STATUSES: readonly InformeStatus[] = [
  'pendiente',
  'generando',
  'borrador',
  'aprobado',
  'error'
];

const VALID_TRANSITIONS: Record<InformeStatus, readonly InformeStatus[]> = {
  pendiente: ['generando'],
  generando: ['borrador', 'error'],
  error: ['generando'],
  borrador: ['aprobado'],
  aprobado: []
};

/** Lanza InformeInvalidTransitionError si from→to no está permitido (R7, R24). */
export function assertInformeTransition(from: InformeStatus, to: InformeStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new InformeInvalidTransitionError(from, to);
  }
}
