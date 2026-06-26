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
const optionalPort = z.preprocess(
  (val) => {
    const s = emptyToUndefined(val);
    if (s === undefined) return undefined;
    const n = Number(s);
    return isNaN(n) ? undefined : n;
  },
  z.number().int().positive().optional()
);
const optionalBool = z.preprocess(
  (val) => {
    const s = emptyToUndefined(val);
    if (s === undefined) return undefined;
    return s === 'true' || s === '1';
  },
  z.boolean().optional()
);

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
  SESSION_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_ENDPOINT: optionalUrl,
  PUBLIC_APP_URL: z.string().url(),
  INSTANCE_ID: optionalString,
  // ── Email SMTP (#49) ──
  SMTP_HOST: optionalString,
  SMTP_PORT: optionalPort,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM: optionalString,
  SMTP_SECURE: optionalBool
});

/** Id estable de la instancia para dedupe de bundles (#20). Fallback 'unknown'. */
export function getInstanceId(): string {
  const raw = process.env.INSTANCE_ID?.trim();
  return raw && !raw.includes('<') ? raw : 'unknown';
}

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Remitente por defecto cuando SMTP_FROM no está configurado (#49 R1). */
export const DEFAULT_SMTP_FROM = 'auditorias@serviciosysistemas.com.ar';

/** Remitente efectivo: SMTP_FROM o default corporativo SyS. */
export function resolveSmtpFrom(env: ServerEnv): string {
  return env.SMTP_FROM ?? DEFAULT_SMTP_FROM;
}

/** Parsea env en arranque server; lanza ZodError si falta var obligatoria. */
export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse(process.env);
}
