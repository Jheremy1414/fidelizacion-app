import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { BOLIVIA_CITIES, BOLIVIA_DEFAULT_COORDS } from '../../utils/bolivia';

interface BoliviaLocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (nextLat: number, nextLng: number) => void;
  heightClassName?: string;
  theme?: 'light' | 'dark';
  radiusMeters?: number;
}

function createPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'blockops-map-pin',
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        background: linear-gradient(135deg, #FF7A00, #F59E0B);
        border: 3px solid #ffffff;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        transform: translate(-50%, -50%);
      ">
        <div style="width: 10px; height: 10px; border-radius: 9999px; background: #ffffff;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export const BoliviaLocationPicker: React.FC<BoliviaLocationPickerProps> = ({
  lat,
  lng,
  onChange,
  heightClassName = 'h-64',
  theme = 'light',
  radiusMeters = 120,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const isDark = theme === 'dark';
  const hasLocation = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const validLat = hasLocation ? Number(lat) : BOLIVIA_DEFAULT_COORDS.lat;
  const validLng = hasLocation ? Number(lng) : BOLIVIA_DEFAULT_COORDS.lng;

  // Initialize Leaflet map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [validLat, validLng],
      zoom: 15,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([validLat, validLng], {
      draggable: true,
      icon: createPinIcon(),
    }).addTo(map);

    const circle = L.circle([validLat, validLng], {
      radius: Math.max(20, radiusMeters || 120),
      color: '#0EA5E9',
      weight: 2,
      fillColor: '#0EA5E9',
      fillOpacity: 0.16,
    }).addTo(map);

    const commitPoint = (nextLat: number, nextLng: number) => {
      const fixedLat = Number(nextLat.toFixed(6));
      const fixedLng = Number(nextLng.toFixed(6));
      marker.setLatLng([fixedLat, fixedLng]);
      circle.setLatLng([fixedLat, fixedLng]);
      onChangeRef.current(fixedLat, fixedLng);
    };

    map.on('click', (ev: L.LeafletMouseEvent) => {
      commitPoint(ev.latlng.lat, ev.latlng.lng);
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      commitPoint(pos.lat, pos.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    // Ensure proper tile sizing after modal/tab transitions
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  // Sync external lat/lng changes (e.g. city preset, GPS, or typed input)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    const circle = circleRef.current;
    if (!map || !marker || !circle) return;

    const current = marker.getLatLng();
    const moved =
      Math.abs(current.lat - validLat) > 0.00001 ||
      Math.abs(current.lng - validLng) > 0.00001;

    if (moved) {
      marker.setLatLng([validLat, validLng]);
      circle.setLatLng([validLat, validLng]);
      map.setView([validLat, validLng], Math.max(map.getZoom(), 14), { animate: true });
    }
  }, [validLat, validLng]);

  // Sync radius circle changes
  useEffect(() => {
    if (circleRef.current && radiusMeters && radiusMeters > 0) {
      circleRef.current.setRadius(radiusMeters);
    }
  }, [radiusMeters]);

  const handleUseGps = () => {
    setStatusMsg(null);
    if (!navigator.geolocation) {
      setStatusMsg('Tu navegador no soporta geolocalización GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = Number(pos.coords.latitude.toFixed(6));
        const nextLng = Number(pos.coords.longitude.toFixed(6));
        onChange(nextLat, nextLng);
        mapRef.current?.setView([nextLat, nextLng], 16, { animate: true });
      },
      () => {
        setStatusMsg('No se pudo obtener tu GPS. Puedes elegir ciudad o tocar el mapa.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSearchAddress = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setStatusMsg(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=bo&limit=1&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es' },
      });
      const results = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (!results || results.length === 0) {
        setStatusMsg('No encontramos esa dirección en Bolivia. Prueba con zona + ciudad.');
        return;
      }
      const nextLat = Number(Number(results[0].lat).toFixed(6));
      const nextLng = Number(Number(results[0].lon).toFixed(6));
      onChange(nextLat, nextLng);
      mapRef.current?.setView([nextLat, nextLng], 16, { animate: true });
    } catch {
      setStatusMsg('Error al buscar dirección. Haz clic directamente en el mapa.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-xs font-bold flex items-center gap-1.5 ${
            isDark ? 'text-slate-200' : 'text-slate-700'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-[#FF7A00]" />
          <span>Ubicación del Local (Radio GPS 120m - Bolivia)</span>
        </span>
        <div className="flex items-center gap-2.5">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              hasLocation
                ? isDark
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isDark
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            {hasLocation ? 'Ubicación fijada ✓' : 'Pendiente fijar en mapa *'}
          </span>
          <button
            type="button"
            onClick={handleUseGps}
            className={`inline-flex items-center gap-1.5 text-xs font-bold hover:underline ${
              isDark ? 'text-[#0EA5E9]' : 'text-[#0B4BE3]'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>Usar mi GPS actual</span>
          </button>
        </div>
      </div>

      {/* City quick presets across Bolivia */}
      <div className="flex flex-wrap gap-1.5">
        {BOLIVIA_CITIES.map((city) => {
          const active =
            hasLocation &&
            Math.abs(validLat - city.lat) < 0.08 &&
            Math.abs(validLng - city.lng) < 0.08;
          return (
            <button
              key={city.name}
              type="button"
              onClick={() => {
                setStatusMsg(null);
                onChange(city.lat, city.lng);
                mapRef.current?.setView([city.lat, city.lng], 14, { animate: true });
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                active
                  ? 'bg-[#0B4BE3] text-white border-[#0B4BE3]'
                  : isDark
                  ? 'bg-[#090D16] text-slate-300 border-white/15 hover:border-[#0EA5E9]'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-[#0EA5E9]'
              }`}
            >
              {city.name}
            </button>
          );
        })}
      </div>

      {/* Bolivia address search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearchAddress();
              }
            }}
            placeholder="Buscar calle, plaza o zona en Bolivia (ej. Equipetrol Santa Cruz)..."
            className={`w-full rounded-xl border pl-9 pr-3 py-2 text-xs font-medium focus:outline-none ${
              isDark
                ? 'border-white/15 bg-[#090D16] text-white placeholder:text-slate-500 focus:border-[#0EA5E9]'
                : 'border-slate-200 bg-white text-slate-800 focus:border-[#0B4BE3]'
            }`}
          />
        </div>
        <button
          type="button"
          disabled={searching}
          onClick={handleSearchAddress}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-60 transition shrink-0 ${
            isDark
              ? 'bg-[#0EA5E9] hover:bg-sky-400 text-slate-950'
              : 'bg-slate-900 hover:bg-slate-800 text-white'
          }`}
        >
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl px-3 py-2 text-[11px] font-medium border ${
            isDark
              ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {statusMsg}
        </div>
      )}

      {/* Real OpenStreetMap Interactive Canvas */}
      <div
        ref={mapContainerRef}
        className={`w-full ${heightClassName} rounded-2xl border overflow-hidden shadow-inner z-0 ${
          isDark ? 'border-white/15' : 'border-slate-200'
        }`}
      />

      <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        Haz clic en el mapa o arrastra el pin naranja hasta la puerta exacta de tu local para activar el radar GPS de verificación ({Math.round(radiusMeters || 120)}m de radio).
      </p>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label
            className={`block text-[10px] font-bold mb-1 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Latitud
          </label>
          <input
            type="number"
            step="0.000001"
            value={hasLocation ? validLat : ''}
            placeholder={String(BOLIVIA_DEFAULT_COORDS.lat)}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed)) onChange(parsed, validLng);
            }}
            className={`w-full rounded-xl border px-3 py-2 font-mono text-xs ${
              isDark
                ? 'border-white/15 bg-[#090D16] text-white placeholder:text-slate-600'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
          />
        </div>
        <div>
          <label
            className={`block text-[10px] font-bold mb-1 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Longitud
          </label>
          <input
            type="number"
            step="0.000001"
            value={hasLocation ? validLng : ''}
            placeholder={String(BOLIVIA_DEFAULT_COORDS.lng)}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed)) onChange(validLat, parsed);
            }}
            className={`w-full rounded-xl border px-3 py-2 font-mono text-xs ${
              isDark
                ? 'border-white/15 bg-[#090D16] text-white placeholder:text-slate-600'
                : 'border-slate-200 bg-white text-slate-900'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

