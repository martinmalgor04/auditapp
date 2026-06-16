import { logger } from '$lib/server/logger';
import { processReunionJobDirect } from './direct';
import { dispatchReunionWebhook } from './webhook';

export type EnqueueOptions = {
  /** Si true, el STT ya fue hecho (upload directo) — solo ejecutar extracción LLM. */
  skipStt?: boolean;
};

/** Encola procesamiento de una sesión de reunión según el modo configurado. */
export async function enqueueReunionProcessing(sessionId: string, opts: EnqueueOptions = {}): Promise<void> {
  const mode = process.env.REUNION_PIPELINE_MODE ?? 'direct';

  if (mode === 'webhook') {
    await dispatchReunionWebhook(sessionId);
  } else {
    processReunionJob(sessionId, opts).catch((err) => {
      logger.error('reunion_worker_error', { sessionId, error: String(err) });
    });
  }
}

/** Procesa el job de reunión (STT + LLM) según modo configurado. */
export async function processReunionJob(sessionId: string, opts: EnqueueOptions = {}): Promise<void> {
  logger.info('reunion_job_start', { sessionId, skipStt: opts.skipStt });
  await processReunionJobDirect(sessionId, opts.skipStt);
  logger.info('reunion_job_end', { sessionId });
}

/** Re-procesa sesiones en estado error o processing >5min (cron/fallback). */
export async function processPendingReunionJobs(): Promise<void> {
  const { getSql } = await import('$lib/server/db/client');
  const sql = getSql();

  const stale = await sql<{ id: string }[]>`
    SELECT id FROM reunion_session
    WHERE archived_at IS NULL
      AND (
        (status = 'error')
        OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
      )
    LIMIT 10
  `;

  for (const row of stale) {
    processReunionJob(row.id).catch((err) => {
      logger.error('reunion_pending_job_error', { sessionId: row.id, error: String(err) });
    });
  }
}
