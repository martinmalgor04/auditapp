export const OFFICIAL_COLORS = {
  azulProfundo: '#0A1929',
  azulMedio: '#102A43',
  azulElectrico: '#2196F3',
  celeste: '#A2C6D4',
  offwhite: '#F7F9FB',
  verde: '#27AE60',
  rojo: '#E63946',
  naranja: '#F39C12',
  grisNeutro: '#908A82'
} as const;

// --sys-primary fue promovido a token oficial en feature #42 (R2) y ya no es legacy.
export const LEGACY_BANNED = [
  '#1e4d8c',
  '#163a6b',
  '#2b7de9',
  '#003366',
  '--sys-primary-dark',
  '--sys-accent'
] as const;
