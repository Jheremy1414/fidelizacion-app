-- ============================================================================
-- BlockOps Loyalty - Realtime y lectura pública de campañas push para /tap/:slug
-- Ejecuta este script en el SQL Editor de Supabase para que los clientes
-- reciban notificaciones nativas en vivo desde `marketing_pushes`.
-- ============================================================================

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.marketing_pushes;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lectura pública de campañas push"
    ON public.marketing_pushes
    FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

