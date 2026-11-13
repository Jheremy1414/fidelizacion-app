-- ============================================================================
-- BlockOps Loyalty - Migración 009: Métodos de Validación (Auto / Aceptación / PIN)
-- y Radio de Radar GPS personalizado en los programas de fidelización
-- Ejecuta este script en el SQL Editor de Supabase si deseas sincronizar
-- programas creados anteriormente.
-- ============================================================================

UPDATE public.loyalty_programs
SET rules = jsonb_set(
  jsonb_set(
    rules,
    '{validation_mode}',
    to_jsonb(COALESCE(rules->>'validation_mode', CASE WHEN (rules->>'auto_approve')::boolean IS FALSE THEN 'approval' ELSE 'auto' END))
  ),
  '{gps_radius_meters}',
  to_jsonb(COALESCE((rules->>'gps_radius_meters')::numeric, 120))
)
WHERE rules IS NOT NULL;

