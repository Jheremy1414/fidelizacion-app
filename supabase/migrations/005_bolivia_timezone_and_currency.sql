-- ============================================================================
-- BlockOps Loyalty - 005: Zona Horaria Bolivia (America/La_Paz, UTC-4),
-- Coordenadas base en Bolivia y Moneda en Bolivianos (Bs)
-- ============================================================================

-- 1. Configurar zona horaria oficial de Bolivia (UTC-4) en sesiones y base de datos
--    (envuelto de forma segura para entornos administrados de Supabase)
DO $$ BEGIN
  EXECUTE 'ALTER DATABASE postgres SET timezone TO ''America/La_Paz''';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  EXECUTE 'ALTER ROLE authenticator SET timezone TO ''America/La_Paz''';
  EXECUTE 'ALTER ROLE authenticated SET timezone TO ''America/La_Paz''';
  EXECUTE 'ALTER ROLE anon SET timezone TO ''America/La_Paz''';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Funciones auxiliares para consultar y registrar fechas en hora oficial de Bolivia
CREATE OR REPLACE FUNCTION public.bolivia_now()
RETURNS TIMESTAMP
LANGUAGE sql
STABLE
AS $$
  SELECT now() AT TIME ZONE 'America/La_Paz';
$$;

CREATE OR REPLACE FUNCTION public.to_bolivia_time(ts TIMESTAMPTZ)
RETURNS TIMESTAMP
LANGUAGE sql
STABLE
AS $$
  SELECT ts AT TIME ZONE 'America/La_Paz';
$$;

-- 3. Coordenadas por defecto en Bolivia (Santa Cruz de la Sierra)
ALTER TABLE public.tenants
  ALTER COLUMN lat SET DEFAULT -17.783329,
  ALTER COLUMN lng SET DEFAULT -63.182126;

-- Corregir negocios existentes que conservaron coordenadas placeholder anteriores
UPDATE public.tenants
SET lat = -17.783329, lng = -63.182126
WHERE lat = 19.432608 AND lng = -99.133209;

