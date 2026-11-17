import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { BoliviaLocationPicker } from '../../components/map/BoliviaLocationPicker';
import { useApp } from '../../context/AppContext';
import { supabase, uploadTenantLogo } from '../../lib/supabase';
import { TouchNumberInput } from '../../components/ui/TouchNumberInput';
import { LOYALTY_PLANS_META, ValidationMode } from '../../types/loyalty';

export const SettingsPage: React.FC = () => {
  const { user, activeTenant, updateTenantAndProgram } = useApp();

  const [logoUrl, setLogoUrl] = useState<string | null>(activeTenant?.logo_url || null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoNotice, setLogoNotice] = useState<string | null>(null);
  const [cooldownHours, setCooldownHours] = useState(
    activeTenant?.program?.rules.cooldown_hours ?? 4
  );
  const [goalPoints, setGoalPoints] = useState<number>(
    activeTenant?.program?.rules.goal_points ?? 500
  );
  const [pointsPerVisit, setPointsPerVisit] = useState<number>(
    activeTenant?.program?.rules.points_per_visit ?? 50
  );
  const [stampsGoal, setStampsGoal] = useState<number>(
    activeTenant?.program?.rules.goal ?? 10
  );
  const [targetSpend, setTargetSpend] = useState<number>(
    activeTenant?.program?.rules.target_spend ?? 1000
  );
  const [discountPercent, setDiscountPercent] = useState<number>(
    activeTenant?.program?.rules.discount_percent ?? 20
  );
  const [cashbackPercent, setCashbackPercent] = useState<number>(
    activeTenant?.program?.rules.cashback_percent ?? 10
  );
  const [monthlyVisits, setMonthlyVisits] = useState<number>(
    activeTenant?.program?.rules.monthly_visits ?? 4
  );
  const [rewardName, setRewardName] = useState<string>(
    activeTenant?.program?.rules.reward ?? ''
  );
  const [programDescription, setProgramDescription] = useState<string>(
    activeTenant?.program?.rules.description ?? ''
  );
  const [validationMode, setValidationMode] = useState<ValidationMode>(
    activeTenant?.program?.rules.validation_mode ||
      (activeTenant?.program?.rules.auto_approve === false ? 'approval' : 'auto')
  );
  const [cashierPin, setCashierPin] = useState(
    activeTenant?.program?.rules.cashier_pin || ''
  );
  const [gpsRadiusMeters, setGpsRadiusMeters] = useState<number>(
    activeTenant?.program?.rules.gps_radius_meters ?? 120
  );
  const [lat, setLat] = useState<number | null>(activeTenant?.lat ?? null);
  const [lng, setLng] = useState<number | null>(activeTenant?.lng ?? null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [tempLat, setTempLat] = useState<number | null>(activeTenant?.lat ?? null);
  const [tempLng, setTempLng] = useState<number | null>(activeTenant?.lng ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenant) return;
    setLogoUrl(activeTenant.logo_url || null);
    const r = activeTenant.program?.rules;
    setCooldownHours(r?.cooldown_hours ?? 4);
    setGoalPoints(r?.goal_points ?? 500);
    setPointsPerVisit(r?.points_per_visit ?? 50);
    setStampsGoal(r?.goal ?? 10);
    setTargetSpend(r?.target_spend ?? 1000);
    setDiscountPercent(r?.discount_percent ?? 20);
    setCashbackPercent(r?.cashback_percent ?? 10);
    setMonthlyVisits(r?.monthly_visits ?? 4);
    setRewardName(r?.reward ?? '');
    setProgramDescription(r?.description ?? '');
    setValidationMode(r?.validation_mode || (r?.auto_approve === false ? 'approval' : 'auto'));
    setCashierPin(r?.cashier_pin || '');
    setGpsRadiusMeters(r?.gps_radius_meters ?? 120);
    setLat(activeTenant.lat ?? null);
    setLng(activeTenant.lng ?? null);
  }, [
    activeTenant?.id,
    activeTenant?.logo_url,
    activeTenant?.lat,
    activeTenant?.lng,
    activeTenant?.program?.rules,
  ]);

  if (!activeTenant || !activeTenant.program) return null;

  const planMeta = LOYALTY_PLANS_META[activeTenant.program.type];

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoUploading(true);
    setLogoNotice(null);
    setErrorMsg(null);
    try {
      const publicUrl = await uploadTenantLogo(file, activeTenant.slug);
      await updateTenantAndProgram(activeTenant.id, { logo_url: publicUrl });
      setLogoUrl(publicUrl);
      setLogoNotice('Logo actualizado correctamente.');
      setTimeout(() => setLogoNotice(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al subir el logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    setLogoUploading(true);
    setLogoNotice(null);
    setErrorMsg(null);
    try {
      await updateTenantAndProgram(activeTenant.id, { logo_url: null });
      setLogoUrl(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo quitar el logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentProgram = activeTenant?.program;
    if (!activeTenant || !currentProgram) return;
    setErrorMsg(null);
    setSaved(false);

    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setErrorMsg('Debes fijar la ubicación del local en el mapa antes de guardar.');
      return;
    }

    if (validationMode === 'pin' && (!cashierPin.trim() || cashierPin.trim().length < 3)) {
      setErrorMsg('Debes definir un PIN de mostrador de al menos 3 dígitos.');
      return;
    }

    setSaving(true);
    try {
      await updateTenantAndProgram(
        activeTenant.id,
        {
          lat: Number(lat),
          lng: Number(lng),
        },
        {
          rules: {
            ...currentProgram.rules,
            goal_points: Number(goalPoints) || 500,
            points_per_visit: Number(pointsPerVisit) || 50,
            goal: Number(stampsGoal) || 10,
            target_spend: Number(targetSpend) || 1000,
            discount_percent: Number(discountPercent) || 20,
            cashback_percent: Number(cashbackPercent) || 10,
            monthly_visits: Number(monthlyVisits) || 4,
            reward: rewardName.trim() || currentProgram.rules.reward,
            description: programDescription.trim() || currentProgram.rules.description,
            cooldown_hours: Math.max(0, Number(cooldownHours)),
            validation_mode: validationMode,
            auto_approve: validationMode === 'auto',
            cashier_pin: validationMode === 'pin' ? cashierPin.trim() : null,
            gps_radius_meters: Math.max(20, Math.min(5000, Number(gpsRadiusMeters) || 120)),
          },
        }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSaved(false);
    if (newPassword.length < 6) {
      setPwError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Las contraseñas no coinciden.');
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setNewPassword('');
      setConfirmPassword('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 4000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Sliders className="w-6 h-6 text-[#0B4BE3]" />
          <span>Configuración del Negocio</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Actualiza el logo de tu marca, las reglas antifraude y la ubicación exacta de tu local.
        </p>
      </div>

      <form onSubmit={handleSave} className="glass-card-light rounded-2xl p-6 space-y-5">
        {errorMsg && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {logoNotice && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2 font-semibold">
            <Check className="w-4 h-4 shrink-0" />
            <span>{logoNotice}</span>
          </div>
        )}

        {/* Logo Upload (client-facing only) */}
        <div className="rounded-2xl bg-slate-50/80 border border-slate-200/80 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={activeTenant.name}
                className="h-14 w-14 rounded-2xl object-cover border border-slate-200 bg-white shadow-sm shrink-0"
              />
            ) : (
              <div
                style={{ backgroundColor: activeTenant.brand_color }}
                className="h-14 w-14 rounded-2xl text-white flex items-center justify-center font-display font-extrabold text-lg shadow-sm shrink-0"
              >
                {activeTenant.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-slate-800">Logo del Negocio</div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {logoUrl
                  ? 'Logo activo en tus tarjetas digitales y póster de mostrador ✓'
                  : 'Sube una imagen PNG, JPG o WEBP para mostrarla en tus tarjetas.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              className={`cursor-pointer inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:border-[#0B4BE3] px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition ${
                logoUploading ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              {logoUploading ? (
                <Loader2 className="w-4 h-4 text-[#0B4BE3] animate-spin" />
              ) : (
                <ImagePlus className="w-4 h-4 text-[#0B4BE3]" />
              )}
              <span>{logoUploading ? 'Subiendo...' : logoUrl ? 'Cambiar Logo' : 'Subir Logo'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={logoUploading}
                onChange={handleLogoUpload}
                className="hidden"
              />
            </label>

            {logoUrl && (
              <button
                type="button"
                disabled={logoUploading}
                onClick={handleRemoveLogo}
                title="Quitar logo"
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-bold text-rose-600 transition disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Quitar</span>
              </button>
            )}
          </div>
        </div>

        {/* Configuración de Reglas del Programa de Fidelización */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-[#0B4BE3]" />
                <span>Reglas de Tu Programa · {planMeta.name}</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ajusta las metas de puntos, sellos o premios. Los cambios se reflejarán de inmediato en las tarjetas de tus clientes.
              </p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#0B4BE3] text-xs font-bold">
              {planMeta.name}
            </span>
          </div>

          {activeTenant.program.type === 'points' && (
            <div className="space-y-4">
              <TouchNumberInput
                label="Meta de Puntos para Recompensa"
                value={goalPoints}
                onChange={setGoalPoints}
                min={50}
                max={10000}
                step={50}
                suffix="pts"
                presets={[100, 250, 500, 1000, 2000]}
                helperText="Puntos acumulados requeridos para canjear el premio. Toca un valor o usa [+] y [-]."
              />

              <TouchNumberInput
                label="Puntos Otorgados por Visita / Compra"
                value={pointsPerVisit}
                onChange={setPointsPerVisit}
                min={5}
                max={2000}
                step={10}
                suffix="pts"
                presets={[10, 20, 50, 100]}
                helperText="Puntos que suma el cliente automáticamente en cada escaneo en mostrador."
              />
            </div>
          )}

          {activeTenant.program.type === 'stamps' && (
            <div>
              <TouchNumberInput
                label="Meta de Sellos para Recompensa"
                value={stampsGoal}
                onChange={setStampsGoal}
                min={3}
                max={30}
                step={1}
                suffix="sellos"
                presets={[5, 8, 10, 12]}
                helperText="Cantidad de sellos requeridos para llenar la tarjeta y ganar el beneficio."
              />
            </div>
          )}

          {activeTenant.program.type === 'discount' && (
            <div className="space-y-4">
              <TouchNumberInput
                label="Meta de Gasto Acumulado"
                value={targetSpend}
                onChange={setTargetSpend}
                min={50}
                max={50000}
                step={100}
                suffix="Bs"
                presets={[200, 500, 1000, 2000]}
              />
              <TouchNumberInput
                label="% Descuento Otorgado"
                value={discountPercent}
                onChange={setDiscountPercent}
                min={5}
                max={90}
                step={5}
                suffix="%"
                presets={[10, 15, 20, 25, 30]}
              />
            </div>
          )}

          {activeTenant.program.type === 'cashback' && (
            <div>
              <TouchNumberInput
                label="% Cashback Acumulable"
                value={cashbackPercent}
                onChange={setCashbackPercent}
                min={1}
                max={50}
                step={1}
                suffix="%"
                presets={[5, 10, 15, 20]}
              />
            </div>
          )}

          {activeTenant.program.type === 'subscription' && (
            <div>
              <TouchNumberInput
                label="Visitas Mensuales Incluidas"
                value={monthlyVisits}
                onChange={setMonthlyVisits}
                min={1}
                max={31}
                step={1}
                suffix="visitas"
                presets={[2, 4, 8, 12]}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Premio / Beneficio al Completar *
              </label>
              <input
                type="text"
                required
                value={rewardName}
                onChange={(e) => setRewardName(e.target.value)}
                placeholder="Ej. 1 Café Americano Gratis"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30 focus:border-[#0B4BE3]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Instrucciones / Condiciones (opcional)
              </label>
              <input
                type="text"
                value={programDescription}
                onChange={(e) => setProgramDescription(e.target.value)}
                placeholder="Ej. Válido de Lunes a Domingo"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30 focus:border-[#0B4BE3]"
              />
            </div>
          </div>
        </div>

        {/* Método de Validación en Mostrador */}
        <div className="rounded-2xl bg-slate-50/80 border border-slate-200/80 p-4 space-y-3.5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0B4BE3]" />
                <span>Método de Validación al Registrar / Sumar Visita</span>
              </span>
              <span className="text-[11px] font-bold text-[#0B4BE3]">
                {validationMode === 'auto'
                  ? '⚡ Automático al escanear'
                  : validationMode === 'approval'
                  ? '🛡️ Solicitud de Aceptación en Caja'
                  : '🔑 Código PIN de Mostrador'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Elige cómo deseas validar las visitas de tus clientes en el mostrador.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setValidationMode('auto')}
              className={`text-left p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                validationMode === 'auto'
                  ? 'border-[#0B4BE3] bg-blue-50/70 shadow-sm ring-1 ring-[#0B4BE3]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-[#0B4BE3] flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#0B4BE3]">
                  Rápido
                </span>
              </div>
              <div>
                <strong className="text-xs text-slate-900 block">Automático al escanear</strong>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  Suma visitas al instante validando el radar GPS y Cooldown.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setValidationMode('approval')}
              className={`text-left p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                validationMode === 'approval'
                  ? 'border-[#FF7A00] bg-amber-50/70 shadow-sm ring-1 ring-[#FF7A00]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="h-7 w-7 rounded-lg bg-amber-500/10 text-[#FF7A00] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-[#FF7A00]">
                  Recomendado
                </span>
              </div>
              <div>
                <strong className="text-xs text-slate-900 block">Solicitud de Aceptación</strong>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  El cliente envía la visita y el cajero la aprueba con 1 clic en mostrador.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setValidationMode('pin')}
              className={`text-left p-3.5 rounded-xl border transition flex flex-col justify-between gap-2 ${
                validationMode === 'pin'
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-1 ring-indigo-600'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                  Código PIN
                </span>
              </div>
              <div>
                <strong className="text-xs text-slate-900 block">Código PIN de Mostrador</strong>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  El cliente debe ingresar un código numérico (dictado en caja) para poder sumar.
                </p>
              </div>
            </button>
          </div>

          {validationMode === 'pin' && (
            <div className="rounded-xl bg-white border border-indigo-200 p-3.5 space-y-2 mt-2">
              <label className="block text-xs font-bold text-slate-800">
                Define el PIN o Código de Mostrador (3 a 8 caracteres)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  maxLength={8}
                  required={validationMode === 'pin'}
                  value={cashierPin}
                  onChange={(e) => setCashierPin(e.target.value.toUpperCase())}
                  placeholder="Ej. 1234"
                  className="w-40 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-extrabold tracking-widest text-slate-900 text-center uppercase"
                />
                <span className="text-[11px] text-slate-500">
                  Dicta o coloca este PIN en caja. El cliente deberá teclearlo al escanear para sumar.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Antifraude: Radar GPS & Cooldown */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Radar GPS Permitido (Radio en Metros)
                </label>
                <span className="text-[11px] font-extrabold text-[#0B4BE3]">
                  {Math.round(gpsRadiusMeters)} metros
                </span>
              </div>
              <input
                type="number"
                min={20}
                max={5000}
                step={10}
                value={gpsRadiusMeters}
                onChange={(e) => setGpsRadiusMeters(Math.max(20, Number(e.target.value)))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[50, 100, 120, 250, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGpsRadiusMeters(preset)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                      gpsRadiusMeters === preset
                        ? 'bg-[#0B4BE3] text-white border-[#0B4BE3]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {preset >= 1000 ? `${preset / 1000} km` : `${preset} m`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                El círculo azul en el mapa muestra exactamente este alcance alrededor de tu local.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Antifraude: Cooldown (Horas entre visitas)
              </label>
              <input
                type="number"
                min={0}
                max={72}
                value={cooldownHours}
                onChange={(e) => setCooldownHours(Math.max(0, Number(e.target.value)))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tiempo mínimo que debe esperar el cliente para volver a sumar después de una visita.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                    lat !== null && lng !== null
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border border-amber-200'
                  }`}
                >
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Ubicación GPS del Local</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        lat !== null && lng !== null
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {lat !== null && lng !== null ? 'Ubicación fijada ✓' : 'Pendiente fijar *'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {lat !== null && lng !== null
                      ? `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)} · Radar: ${Math.round(
                          gpsRadiusMeters
                        )}m`
                      : 'Abre el mapa para fijar las coordenadas seguras de tu local'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTempLat(lat);
                  setTempLng(lng);
                  setShowMapModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-black px-4 py-2.5 text-xs font-bold text-white shadow transition"
              >
                <MapPin className="w-4 h-4 text-[#FF7A00]" />
                <span>
                  {lat !== null && lng !== null
                    ? 'Cambiar Ubicación en Mapa'
                    : 'Abrir Mapa y Fijar Ubicación'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal protegido para fijar ubicación en mapa sin riesgo de modificar por error al scrollear */}
        {showMapModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-xl bg-[#0B4BE3]/10 text-[#0B4BE3] flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-[#FF7A00]" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Fijar Ubicación del Local
                    </h3>
                    <p className="text-xs text-slate-500">
                      Mueve el pin o haz clic en la puerta exacta. Radar actual:{' '}
                      <strong className="text-[#0B4BE3]">{Math.round(gpsRadiusMeters)}m</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapModal(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <BoliviaLocationPicker
                lat={tempLat}
                lng={tempLng}
                radiusMeters={gpsRadiusMeters}
                heightClassName="h-80 sm:h-96"
                onChange={(nextLat, nextLng) => {
                  setTempLat(nextLat);
                  setTempLng(nextLng);
                }}
              />

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-mono">
                  {tempLat !== null && tempLng !== null
                    ? `Seleccionado: ${tempLat.toFixed(6)}, ${tempLng.toFixed(6)}`
                    : 'Haz clic en el mapa para marcar el punto'}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMapModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={tempLat === null || tempLng === null}
                    onClick={() => {
                      if (tempLat !== null && tempLng !== null) {
                        setLat(tempLat);
                        setLng(tempLng);
                      }
                      setShowMapModal(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#0B4BE3] hover:bg-blue-700 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition"
                  >
                    <Check className="w-4 h-4" />
                    <span>Fijar Esta Ubicación</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <Check className="w-4 h-4" /> Cambios guardados correctamente
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Ajusta el método de validación, radar GPS y horas de cooldown.
            </span>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B4BE3] hover:bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-60 transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Validación, Antifraude y Ubicación'}</span>
          </button>
        </div>
      </form>

      <form onSubmit={handlePasswordChange} className="glass-card-light rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#FF7A00]" />
              <span>Credenciales de Acceso y Contraseña</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cuenta conectada: <strong className="text-slate-800">{user?.email}</strong>. Cambia tu contraseña cuando lo desees.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0B4BE3]"
          >
            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showPassword ? 'Ocultar' : 'Mostrar'}</span>
          </button>
        </div>

        {pwError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pwError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Nueva Contraseña</label>
            <input
              type={showPassword ? 'text' : 'password'}
              minLength={6}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirmar Contraseña</label>
            <input
              type={showPassword ? 'text' : 'password'}
              minLength={6}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {pwSaved ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <Check className="w-4 h-4" /> Contraseña actualizada correctamente
            </span>
          ) : (
            <span className="text-xs text-slate-400">Protege tu acceso con una clave segura</span>
          )}
          <button
            type="submit"
            disabled={pwSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-60 transition"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{pwSaving ? 'Actualizando...' : 'Actualizar Contraseña'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
