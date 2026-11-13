-- ============================================================================
-- BlockOps Loyalty - Columna de edad en clientes para analítica demográfica
-- Ejecuta este script en el SQL Editor de Supabase.
-- ============================================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS age INTEGER;

DO $$ BEGIN
  ALTER TABLE public.customers
    ADD CONSTRAINT customers_age_range CHECK (age IS NULL OR (age >= 12 AND age <= 100));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

