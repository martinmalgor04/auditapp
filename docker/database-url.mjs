import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  user: 'auditapp',
  host: 'postgres',
  port: '5432',
  database: 'auditapp'
};

/** Builds postgres URL. POSTGRES_PASSWORD wins over DATABASE_URL (avoids Dokploy desync). */
export function resolveDatabaseUrl() {
  const password = process.env.POSTGRES_PASSWORD;
  if (password) {
    const user = process.env.POSTGRES_USER ?? DEFAULTS.user;
    const host = process.env.POSTGRES_HOST ?? DEFAULTS.host;
    const port = process.env.POSTGRES_PORT ?? DEFAULTS.port;
    const database = process.env.POSTGRES_DB ?? DEFAULTS.database;
    return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  const url = process.env.DATABASE_URL;
  if (url) return url;

  throw new Error('POSTGRES_PASSWORD is not set (production) and DATABASE_URL is not set');
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    console.log(resolveDatabaseUrl());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
