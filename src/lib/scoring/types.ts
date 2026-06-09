export const SCORING_FIELD_TYPES = [
  'text',
  'number',
  'bool',
  'tri',
  'select',
  'multiselect',
  'date',
  'datetime',
  'list',
  'table',
  'file_ref',
  'money'
] as const;

export type ScoringFieldType = (typeof SCORING_FIELD_TYPES)[number];
