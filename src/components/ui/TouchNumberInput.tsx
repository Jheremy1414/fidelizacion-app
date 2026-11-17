import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface TouchNumberInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  presets?: number[];
  helperText?: string;
}

export const TouchNumberInput: React.FC<TouchNumberInputProps> = ({
  label,
  value,
  onChange,
  min = 1,
  max = 100000,
  step = 10,
  suffix = '',
  presets,
  helperText,
}) => {
  // Mantener un estado de texto local para que al borrar con backspace no salte inmediatamente al valor anterior
  const [rawText, setRawText] = useState(String(value ?? min));

  useEffect(() => {
    setRawText(String(value ?? min));
  }, [value, min]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextStr = e.target.value.replace(/[^0-9]/g, '');
    setRawText(nextStr);
    if (nextStr !== '') {
      const parsed = Number(nextStr);
      if (!Number.isNaN(parsed)) {
        onChange(Math.max(min, Math.min(max, parsed)));
      }
    }
  };

  const handleBlur = () => {
    if (rawText === '' || Number(rawText) < min) {
      setRawText(String(min));
      onChange(min);
    } else if (Number(rawText) > max) {
      setRawText(String(max));
      onChange(max);
    }
  };

  const increment = () => {
    const cur = Number(rawText) || value || min;
    const next = Math.min(max, cur + step);
    setRawText(String(next));
    onChange(next);
  };

  const decrement = () => {
    const cur = Number(rawText) || value || min;
    const next = Math.max(min, cur - step);
    setRawText(String(next));
    onChange(next);
  };

  const selectPreset = (p: number) => {
    setRawText(String(p));
    onChange(p);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700">{label}</label>
        {suffix && <span className="text-[11px] font-semibold text-slate-400">{suffix}</span>}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          className="h-11 w-11 shrink-0 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-slate-700 transition"
          aria-label="Disminuir"
        >
          <Minus className="w-4 h-4 stroke-[2.5]" />
        </button>

        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={rawText}
            onChange={handleInputChange}
            onBlur={handleBlur}
            className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-center text-base font-extrabold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B4BE3]/30 focus:border-[#0B4BE3]"
          />
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          className="h-11 w-11 shrink-0 rounded-xl bg-[#0B4BE3]/10 hover:bg-[#0B4BE3]/20 active:bg-[#0B4BE3]/30 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center text-[#0B4BE3] transition"
          aria-label="Aumentar"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {presets.map((p) => {
            const isSelected = value === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => selectPreset(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  isSelected
                    ? 'bg-[#0B4BE3] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95'
                }`}
              >
                {p.toLocaleString()} {suffix}
              </button>
            );
          })}
        </div>
      )}

      {helperText && <p className="text-[11px] text-slate-500 leading-relaxed">{helperText}</p>}
    </div>
  );
};
