-- ============================================================================
-- Clockops Loyalty - Actualización Trial 14 días, Realtime y Políticas SuperAdmin
-- Ejecuta este script en el SQL Editor de Supabase si ya creaste las tablas base.
-- ============================================================================

-- 1. Ajustar prueba gratuita por defecto a 14 días
ALTER TABLE public.tenants
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + INTERVAL '14 days');

-- 2. Habilitar Supabase Realtime para notificaciones en vivo del Dashboard y /tap/:slug
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.card_transactions;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_cards;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Función y políticas para SuperAdmin (rol 'superadmin' en raw_app_meta_data)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin',
    false
  );
$$;

DO $$ BEGIN
  CREATE POLICY "SuperAdmin gestiona todos los negocios"
    ON public.tenants FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "SuperAdmin gestiona todos los programas"
    ON public.loyalty_programs FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());
EXCEPTION WHEN duplicate_object THEN null;
END $$;

