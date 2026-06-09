import { resetAwsClientForTests, resetR2EnvForTests } from '../../src/lib/server/storage';

export function applyTestR2Env(ttlSeconds = '900'): void {
  process.env.R2_ACCOUNT_ID = 'test-account-id';
  process.env.R2_ACCESS_KEY_ID = 'test-access-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  process.env.R2_BUCKET = 'auditapp-test';
  process.env.R2_ENDPOINT = 'https://test-account-id.r2.cloudflarestorage.com';
  process.env.R2_PRESIGN_TTL_SECONDS = ttlSeconds;
  resetR2EnvForTests();
  resetAwsClientForTests();
}

export function clearTestR2Env(): void {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_PRESIGN_TTL_SECONDS;
  resetR2EnvForTests();
  resetAwsClientForTests();
}
