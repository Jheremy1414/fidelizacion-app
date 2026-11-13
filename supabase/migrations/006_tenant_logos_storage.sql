-- ============================================================================
-- BlockOps Loyalty - 006: Bucket Público tenant-logos y Políticas RLS
-- Permite subir logos en tenant-logos y leer su URL pública (getPublicUrl)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Logos visibles públicamente" ON storage.objects;
CREATE POLICY "Logos visibles públicamente"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tenant-logos');

-- Permite subir logos durante onboarding (tanto para usuarios nuevos como autenticados)
DROP POLICY IF EXISTS "Permitir subir logos en tenant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados suben logos" ON storage.objects;
CREATE POLICY "Permitir subir logos en tenant-logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tenant-logos');

-- Permite actualizar logos en el bucket tenant-logos
DROP POLICY IF EXISTS "Permitir actualizar logos en tenant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios autenticados actualizan logos" ON storage.objects;
CREATE POLICY "Permitir actualizar logos en tenant-logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'tenant-logos')
  WITH CHECK (bucket_id = 'tenant-logos');

DROP POLICY IF EXISTS "Usuarios autenticados eliminan logos" ON storage.objects;
CREATE POLICY "Usuarios autenticados eliminan logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-logos');

