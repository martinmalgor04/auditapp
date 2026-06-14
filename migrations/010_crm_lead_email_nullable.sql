-- auditapp schema v10 — email opcional en crm_lead
--
-- Los leads del relevamiento comercial en calle muchas veces todavía no tienen
-- mail (se relevó razón social, contacto y teléfono). Forzar email rompía la
-- carga de esos prospectos. El índice único sobre lower(email) sigue vigente:
-- Postgres trata cada NULL como distinto, así que admite varios leads sin mail.
ALTER TABLE crm_lead ALTER COLUMN email DROP NOT NULL;
