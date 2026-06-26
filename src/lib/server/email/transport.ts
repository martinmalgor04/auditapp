import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import { getServerEnv, resolveSmtpFrom } from '$lib/server/env';

export const EMAIL_MAX_ATTEMPTS = 3;

export type MailMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailTransport = Pick<Transporter, 'sendMail'>;

let cachedTransport: MailTransport | null | undefined;
let testTransportOverride: MailTransport | null | undefined;

/** Inyecta transport mockeado en tests; null restaura el comportamiento normal. */
export function setMailTransportForTests(transport: MailTransport | null | undefined): void {
  testTransportOverride = transport;
  cachedTransport = undefined;
}

export function resetMailTransportForTests(): void {
  testTransportOverride = undefined;
  cachedTransport = undefined;
}

export function isDryRun(): boolean {
  const env = getServerEnv();
  return !env.SMTP_HOST || process.env.NODE_ENV !== 'production';
}

function createTransport(): MailTransport | null {
  if (testTransportOverride !== undefined) {
    return testTransportOverride;
  }
  const env = getServerEnv();
  if (!env.SMTP_HOST) {
    return null;
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined
  });
}

function getTransport(): MailTransport | null {
  if (cachedTransport === undefined) {
    cachedTransport = createTransport();
  }
  return cachedTransport;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return true;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('temporary') ||
    msg.includes('421') ||
    msg.includes('450') ||
    msg.includes('451')
  );
}

export async function sendWithRetry(message: MailMessage): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    throw new Error('Transporte SMTP no disponible');
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= EMAIL_MAX_ATTEMPTS; attempt++) {
    try {
      await transport.sendMail(message);
      return;
    } catch (err) {
      lastError = err;
      const transient = isTransientError(err);
      if (!transient || attempt === EMAIL_MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(100 * attempt);
    }
  }
  throw lastError;
}

export function resolveFromAddress(): string {
  return resolveSmtpFrom(getServerEnv());
}

/** Expuesto para tests: indica si hay transport instanciado. */
export function hasActiveTransport(): boolean {
  return getTransport() !== null;
}
