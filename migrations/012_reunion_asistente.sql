-- #12 reunion_asistente — tablas de sesión de reunión, transcripción y propuestas IA
-- Depende de: 001_schema (audit, attachment, audit_response, template_item, app_user)

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Extender attachment.kind con 'recording'
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE attachment DROP CONSTRAINT IF EXISTS attachment_kind_check;
ALTER TABLE attachment
  ADD CONSTRAINT attachment_kind_check
  CHECK (kind IN ('photo', 'export', 'recording'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Extender audit_response.source con 'reunion_ia'
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE audit_response DROP CONSTRAINT IF EXISTS audit_response_source_check;
ALTER TABLE audit_response
  ADD CONSTRAINT audit_response_source_check
  CHECK (source IN ('admin', 'cliente', 'tecnico', 'reunion_ia'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Tabla reunion_session
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE reunion_session (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id         uuid        NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  attachment_id    uuid        UNIQUE REFERENCES attachment(id) ON DELETE SET NULL,
  started_by       uuid        NOT NULL REFERENCES app_user(id),
  session_type     text        NOT NULL DEFAULT 'visita'
                               CHECK (session_type IN ('kickoff', 'visita', 'otro')),
  consent_recorded_at timestamptz NOT NULL,
  consent_note     text,
  status           text        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'uploading', 'processing',
                                                  'ready_for_review', 'reviewed', 'error')),
  error_message    text,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reunion_session_audit_id_idx ON reunion_session (audit_id);
CREATE INDEX reunion_session_status_idx   ON reunion_session (status)
  WHERE archived_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Tabla reunion_transcript
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE reunion_transcript (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_session_id  uuid        NOT NULL UNIQUE REFERENCES reunion_session(id) ON DELETE CASCADE,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'processing', 'ready', 'error')),
  full_text           text,
  segments            jsonb,
  stt_provider        text,
  language            text        NOT NULL DEFAULT 'es',
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Tabla reunion_proposal
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE reunion_proposal (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_session_id  uuid        NOT NULL REFERENCES reunion_session(id) ON DELETE CASCADE,
  item_id             uuid        NOT NULL REFERENCES template_item(id),
  proposed_value      jsonb       NOT NULL,
  quote               text        NOT NULL,
  confidence          numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  review_status       text        NOT NULL DEFAULT 'pending'
                                  CHECK (review_status IN ('pending', 'accepted', 'rejected', 'edited')),
  final_value         jsonb,
  reviewed_by         uuid        REFERENCES app_user(id),
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reunion_session_id, item_id)
);

CREATE INDEX reunion_proposal_session_id_idx ON reunion_proposal (reunion_session_id);
CREATE INDEX reunion_proposal_item_id_idx    ON reunion_proposal (item_id);
