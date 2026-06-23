-- Refrescar vista client tras columna empresa.codigo (#41).
-- Postgres no expande SELECT * en vistas existentes al ALTER TABLE.
CREATE OR REPLACE VIEW client AS SELECT * FROM empresa;
