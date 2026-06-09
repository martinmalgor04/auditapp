export { indexToSemaphore } from './semaphore';
export { scoreAudit } from './score-audit';
export { scoreItem } from './score-item';
export { scoreSection, scoreSectionFromItems } from './score-section';
export { computeLiveScores } from './live';
export {
  recalculateAndPersistScores,
  saveClosureFields,
  confirmClosure,
  reopenAudit
} from './persist';
export { buildClosurePreview } from './preview';
export { SECTION_WEIGHT_FACTORS } from './constants';
export type { AuditScoreResult, ScoreBreakdownEntry, Semaphore, TopRisk } from './types';
