import { getSql } from './client';

export type TranscriptStatus = 'pending' | 'processing' | 'ready' | 'error';

export type ReunionTranscriptRow = {
  id: string;
  reunion_session_id: string;
  status: TranscriptStatus;
  full_text: string | null;
  segments: unknown | null;
  stt_provider: string | null;
  language: string;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function upsertReunionTranscript(input: {
  reunionSessionId: string;
  status: TranscriptStatus;
  fullText?: string | null;
  segments?: unknown | null;
  sttProvider?: string | null;
  language?: string;
  errorMessage?: string | null;
}): Promise<string> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO reunion_transcript (
      reunion_session_id, status, full_text, segments, stt_provider, language, error_message
    )
    VALUES (
      ${input.reunionSessionId},
      ${input.status},
      ${input.fullText ?? null},
      ${input.segments ? sql.json(input.segments as never) : null},
      ${input.sttProvider ?? null},
      ${input.language ?? 'es'},
      ${input.errorMessage ?? null}
    )
    ON CONFLICT (reunion_session_id) DO UPDATE SET
      status        = EXCLUDED.status,
      full_text     = EXCLUDED.full_text,
      segments      = EXCLUDED.segments,
      stt_provider  = EXCLUDED.stt_provider,
      language      = EXCLUDED.language,
      error_message = EXCLUDED.error_message,
      updated_at    = now()
    RETURNING id
  `;
  return row.id;
}

export async function getReunionTranscriptBySession(
  reunionSessionId: string
): Promise<ReunionTranscriptRow | null> {
  const sql = getSql();
  const [row] = await sql<ReunionTranscriptRow[]>`
    SELECT
      id, reunion_session_id, status, full_text, segments,
      stt_provider, language, error_message, created_at, updated_at
    FROM reunion_transcript
    WHERE reunion_session_id = ${reunionSessionId}
    LIMIT 1
  `;
  return row ?? null;
}
