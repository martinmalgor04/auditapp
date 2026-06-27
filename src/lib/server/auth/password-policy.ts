import { z } from 'zod';

/**
 * Política de fortaleza de contraseña compartida (#50 decisión de puerta).
 * Solo longitud: mín 8, máx 200. Sin reglas de composición.
 * Fuente de verdad única para el flujo de recuperación por email (#50).
 *
 * Nota: el cambio de contraseña autenticado (#48) usa una política más estricta
 * definida en `profile.ts` (mín 10, letra + dígito) por decisión de diseño anterior.
 */
export const strongPassword = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(200, 'La contraseña es demasiado larga');
