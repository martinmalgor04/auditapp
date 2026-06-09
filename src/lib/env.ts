import { z } from 'zod';

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().url().optional(),
  PUBLIC_APP_URL: z.string().url()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Parsea env en arranque server; lanza ZodError si falta var obligatoria. */
export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}
