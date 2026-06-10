type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const SENSITIVE_KEY = /password|secret|token|session|authorization|cookie|hash/i;

function resolveLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[resolveLogLevel()];
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY.test(key)) {
    return '[redacted]';
  }
  if (value instanceof Error) {
    return serializeError(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'object' && item !== null ? redactContext(item as Record<string, unknown>) : item
    );
  }
  if (typeof value === 'object' && value !== null) {
    return redactContext(value as Record<string, unknown>);
  }
  return value;
}

function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack
    };
  }
  return { value: String(err) };
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    service: 'auditapp',
    ...(context ? redactContext(context) : {})
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    write('debug', message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    write('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>, err?: unknown) {
    write('warn', message, err === undefined ? context : { ...context, err: serializeError(err) });
  },
  error(message: string, context?: Record<string, unknown>, err?: unknown) {
    write('error', message, err === undefined ? context : { ...context, err: serializeError(err) });
  }
};
