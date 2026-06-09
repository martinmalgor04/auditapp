if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-secret-min-32-characters-long!!';
}

if (!process.env.PUBLIC_APP_URL) {
  process.env.PUBLIC_APP_URL = 'http://localhost:5173';
}
