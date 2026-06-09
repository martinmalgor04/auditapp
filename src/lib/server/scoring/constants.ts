import type { SectionWeight } from './types';

export const SECTION_WEIGHT_FACTORS: Record<SectionWeight, number> = {
  bajo: 1,
  medio: 2,
  alto: 3,
  muy_alto: 5
};

export const SEMAPHORE_GREEN_MIN = 70;
export const SEMAPHORE_AMBER_MIN = 40;

export const EOL_STATUS_SCORES = {
  vigente: 100,
  extendido: 50,
  eol: 0
} as const;

export const PC_AGE_THRESHOLDS = { freshMax: 3, extendedMax: 5 } as const;
export const INFRA_AGE_THRESHOLDS = { freshMax: 4, extendedMax: 6 } as const;

export const PC_EQUIPMENT_TYPES = new Set([
  'pc',
  'notebook',
  'laptop',
  'desktop',
  'workstation',
  'computadora',
  'equipo usuario'
]);

export const INFRA_EQUIPMENT_TYPES = new Set([
  'servidor',
  'server',
  'switch',
  'firewall',
  'router',
  'storage',
  'nas',
  'san',
  'red',
  'network'
]);

export const TEMPLATE_CODE_TO_INDEX: Record<string, 'it' | 'erp'> = {
  it: 'it',
  'erp-tango': 'erp',
  'erp-estandar': 'erp'
};
