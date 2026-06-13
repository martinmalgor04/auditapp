export interface ContextConfig {
  rag: {
    enabled: boolean;
    threshold: number;
    count: number;
    timeoutMs: number;
    maxTokens: number;
  };
  catalogo: { enabled: boolean };
  fewshot: { enabled: boolean; maxExamples: number; maxTokens: number };
  promptMaxTokens: number;
}

function flagEnabled(env: Record<string, string | undefined>, key: string): boolean {
  return env[key] === '1';
}

function intEnv(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatEnv(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Flags `=== '1'`; cualquier otro valor → off (R1). */
export function resolveContextConfig(
  env: Record<string, string | undefined> = process.env
): ContextConfig {
  return {
    rag: {
      enabled: flagEnabled(env, 'INFORME_RAG_ENABLED'),
      threshold: floatEnv(env, 'RAG_MATCH_THRESHOLD', 0.4),
      count: intEnv(env, 'RAG_MATCH_COUNT', 8),
      timeoutMs: intEnv(env, 'INFORME_RAG_TIMEOUT_MS', 10_000),
      maxTokens: intEnv(env, 'INFORME_RAG_MAX_TOKENS', 6000)
    },
    catalogo: {
      enabled: flagEnabled(env, 'INFORME_CATALOGO_ENABLED')
    },
    fewshot: {
      enabled: flagEnabled(env, 'INFORME_FEWSHOT_ENABLED'),
      maxExamples: intEnv(env, 'INFORME_FEWSHOT_MAX_EXAMPLES', 2),
      maxTokens: intEnv(env, 'INFORME_FEWSHOT_MAX_TOKENS', 4000)
    },
    promptMaxTokens: intEnv(env, 'INFORME_PROMPT_MAX_TOKENS', 150_000)
  };
}
