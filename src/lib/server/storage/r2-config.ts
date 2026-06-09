import { z } from 'zod';

export const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_ENDPOINT: z.string().url(),
  R2_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900)
});

export type R2Env = z.infer<typeof r2EnvSchema>;

let cachedEnv: R2Env | undefined;

export function getR2Env(): R2Env {
  if (!cachedEnv) {
    const parsed = r2EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Configuración R2 incompleta o inválida: ${missing}`);
    }
    cachedEnv = parsed.data;
  }
  return cachedEnv;
}

/** Solo tests: permite re-leer env tras cambiar process.env. */
export function resetR2EnvForTests(): void {
  cachedEnv = undefined;
}
