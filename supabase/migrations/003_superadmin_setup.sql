-- ============================================================================
-- BlockOps Loyalty - 003: Reparación y Activación Inmediata de SuperAdmin
-- Diseñado para ejecutarse DESPUÉS de 001 y 002_realtime_and_superadmin.sql
-- ============================================================================

-- 1. Tabla de respaldo de correos SuperAdmin autorizados
CREATE TABLE IF NOT EXISTS public.superadmins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuario autenticado consulta su rol superadmin" ON public.superadmins;
CREATE POLICY "Usuario autenticado consulta su rol superadmin"
  ON public.superadmins FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- 2. Registrar tu correo como SuperAdmin oficial
INSERT INTO public.superadmins (email)
VALUES ('catflowborja@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 3. Inyectar role = 'superadmin' en raw_app_meta_data de Supabase Auth
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "superadmin"}'::jsonb
WHERE lower(email) = lower('catflowborja@gmail.com');

-- 4. Actualizar la función is_superadmin() existente para que reconozca
--    tanto el JWT app_metadata como la tabla public.superadmins
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'superadmin'
    OR EXISTS (
      SELECT 1 FROM public.superadmins s
      WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
    ),
    false
  );
$$;

-- 5. Políticas adicionales para que SuperAdmin gestione campañas y transacciones globales
DROP POLICY IF EXISTS "SuperAdmin gestiona todas las campañas" ON public.marketing_pushes;
CREATE POLICY "SuperAdmin gestiona todas las campañas"
  ON public.marketing_pushes FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

