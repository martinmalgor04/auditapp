import type { FieldType } from '$lib/server/db/field-schemas';

export type ScorePoints = 0 | 50 | 100 | null;

export type Semaphore = 'green' | 'amber' | 'red';

export type ScoreBreakdownEntry = {
  itemId: string;
  points: 0 | 50 | 100 | null;
  weight: number;
  rule: string;
};

export type SectionWeight = 'bajo' | 'medio' | 'alto' | 'muy_alto';

export type SectionRow = {
  id: string;
  templateId: string;
  code: string;
  title: string;
  weight: SectionWeight;
  hasScore: boolean;
};

export type TemplateItemRow = {
  id: string;
  sectionId: string;
  fieldType: FieldType;
  options: Record<string, unknown>;
  scores: boolean;
  required: boolean;
  itemWeight: number;
};

export type AuditResponseRow = {
  itemId: string;
  value: unknown;
  na: boolean;
};

export type ScoreItemInput = {
  fieldType: FieldType;
  options: Record<string, unknown>;
  value: unknown;
  na: boolean;
  scores: boolean;
  required: boolean;
  itemWeight: number;
  referenceDate?: Date;
};

export type ItemScoreResult = {
  points: 0 | 50 | 100 | null;
  rule: string;
};

export type SectionScoreResult = {
  score: number;
  breakdown: ScoreBreakdownEntry[];
};

export type AuditScoreResult = {
  sectionScores: Array<{
    sectionId: string;
    code: string;
    score: number;
    breakdown: ScoreBreakdownEntry[];
  }>;
  indiceIt: number | null;
  indiceErp: number | null;
};

export type TopRisk = {
  text: string;
  severity: 'baja' | 'media' | 'alta' | 'critica';
};

export type ClosureFieldsInput = {
  topRisks: TopRisk[];
  quickWins: string[];
  upsellFindings: string[];
  nextStep: string | null;
  sectionObservations?: Record<string, string | null>;
};
