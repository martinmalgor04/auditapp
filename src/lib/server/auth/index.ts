export type {
  UserRole,
  AppUser,
  BriefingAuditContext
} from './types';

export { hashPassword, verifyPassword } from './password';

export {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  SLIDING_RENEW_THRESHOLD_DAYS,
  createSession,
  resolveSession,
  renewSessionIfNeeded,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookies
} from './session';

export {
  authenticate,
  GENERIC_LOGIN_ERROR,
  type LoginResult
} from './login';

export {
  AuthError,
  requireUser,
  requireStaff,
  requireAdmin,
  assertAdminOnly,
  ADMIN_ONLY_ACTIONS,
  type AdminOnlyAction
} from './guards';

export {
  BRIEFING_VALID_STATUSES,
  BRIEFING_UNAVAILABLE_MESSAGE,
  isBriefingStatusValid,
  resolveBriefingByToken,
  type BriefingTokenResult,
  type BriefingValidStatus
} from './briefing-token';

export { isLoginRateLimited, resetLoginRateLimit } from './rate-limit';
