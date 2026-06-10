import { z } from 'zod';

/** Vacío o placeholder de .env.example → undefined (no exige R2 en dev local). */
function emptyToUndefined(val: unknown): unknown {
  if (typeof val !== 'string') {
    return undefined;
  }
  const trimmed = val.trim();
  if (!trimmed || trimmed.includes('<')) {
    return undefined;
  }
  return trimmed;
}

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_ENDPOINT: optionalUrl,
  PUBLIC_APP_URL: z.string().url()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parsea env en arranque server; lanza ZodError si falta var obligatoria. */
export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}
