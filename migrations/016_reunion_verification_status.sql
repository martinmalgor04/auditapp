-- #24 — marcador de verificación Tier 2. Aditivo y nullable: no cambia el comportamiento de #12.
-- Idempotente: re-ejecutable sin error (IF NOT EXISTS + DROP CONSTRAINT IF EXISTS).

ALTER TABLE reunion_proposal
  ADD COLUMN IF NOT EXISTS verification_status text;

ALTER TABLE reunion_proposal
  DROP CONSTRAINT IF EXISTS reunion_proposal_verification_status_check;

ALTER TABLE reunion_proposal
  ADD CONSTRAINT reunion_proposal_verification_status_check
  CHECK (verification_status IS NULL OR verification_status IN ('verified', 'unverified'));
