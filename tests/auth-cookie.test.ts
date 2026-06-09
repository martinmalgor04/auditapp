import { describe, expect, it } from 'vitest';
import { shouldUseSecureCookies } from '../src/lib/server/auth/session';

describe('auth session cookie', () => {
  it('sets Secure cookie when PUBLIC_APP_URL is https', () => {
    expect(
      shouldUseSecureCookies({
        dev: false,
        publicAppUrl: 'https://app.auditoriaserviciosysistemas.com.ar'
      })
    ).toBe(true);
  });

  it('does not set Secure cookie when PUBLIC_APP_URL is http', () => {
    expect(
      shouldUseSecureCookies({
        dev: false,
        publicAppUrl: 'http://localhost:5173'
      })
    ).toBe(false);
  });
});
