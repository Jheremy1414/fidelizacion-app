export const BOLIVIA_TIMEZONE = 'America/La_Paz';
export const BOLIVIA_LOCALE = 'es-BO';
export const BOLIVIA_PHONE_PREFIX = '+591 ';

export function formatBoliviaPhoneInput(raw: string): string {
  const cleaned = raw.replace(/[^\d+\s-]/g, '');
  const trimmed = cleaned.trimStart();

  if (!trimmed || '+591'.startsWith(trimmed)) {
    return BOLIVIA_PHONE_PREFIX;
  }

  if (/^\+591\s*(?:\+?591\s*)+/.test(trimmed)) {
    const rest = trimmed.replace(/^\+591\s*(?:\+?591\s*)+/, '').trimStart();
    return `${BOLIVIA_PHONE_PREFIX}${rest}`;
  }

  if (trimmed.startsWith('+591')) {
    const rest = trimmed.slice(4).trimStart();
    return `${BOLIVIA_PHONE_PREFIX}${rest}`;
  }

  if (trimmed.includes('+591')) {
    const withoutPrefix = trimmed.replace(/\+591\s*/g, '').trimStart();
    return `${BOLIVIA_PHONE_PREFIX}${withoutPrefix}`;
  }

  if (trimmed.startsWith('+')) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.startsWith('591') && digitsOnly.length > 3) {
    return `${BOLIVIA_PHONE_PREFIX}${digitsOnly.slice(3)}`;
  }

  return `${BOLIVIA_PHONE_PREFIX}${trimmed}`;
}

export function normalizeBoliviaPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (trimmed.startsWith('+') && !digits.startsWith('591')) {
    return `+${digits}`;
  }

  const localDigits = digits.startsWith('591') ? digits.slice(3) : digits;
  return localDigits ? `${BOLIVIA_PHONE_PREFIX}${localDigits}` : '';
}

export function isValidCustomerPhone(raw: string): boolean {
  const normalized = normalizeBoliviaPhone(raw);
  if (!normalized) return false;
  const digits = normalized.replace(/\D/g, '');
  if (normalized.startsWith(BOLIVIA_PHONE_PREFIX)) {
    const localDigits = digits.slice(3);
    return localDigits.length >= 7 && localDigits.length <= 10;
  }
  return digits.length >= 8 && digits.length <= 15;
}

export function focusAfterBoliviaPrefix(input: HTMLInputElement): void {
  if (input.value === BOLIVIA_PHONE_PREFIX) {
    const end = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(end, end));
  }
}

export function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusM * c;
}

export function requestCurrentPosition(
  timeoutMs = 8000
): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}

export const BOLIVIA_DEFAULT_COORDS = {
  lat: -17.783329,
  lng: -63.182126,
};

export interface BoliviaCity {
  name: string;
  lat: number;
  lng: number;
}

export const BOLIVIA_CITIES: BoliviaCity[] = [
  { name: 'Santa Cruz', lat: -17.783329, lng: -63.182126 },
  { name: 'La Paz', lat: -16.489689, lng: -68.119293 },
  { name: 'Cochabamba', lat: -17.393542, lng: -66.157014 },
  { name: 'El Alto', lat: -16.504856, lng: -68.163109 },
  { name: 'Sucre', lat: -19.019585, lng: -65.261961 },
  { name: 'Tarija', lat: -21.53549, lng: -64.72956 },
  { name: 'Oruro', lat: -17.9647, lng: -67.106 },
  { name: 'Potosí', lat: -19.58361, lng: -65.75306 },
  { name: 'Trinidad', lat: -14.83333, lng: -64.9 },
];

export function formatBs(amount: number, decimals?: number): string {
  const numeric = Number(amount || 0);
  if (typeof decimals === 'number') {
    return `Bs ${numeric.toLocaleString(BOLIVIA_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
  const hasFraction = Math.abs(numeric % 1) > 0.001;
  return `Bs ${numeric.toLocaleString(BOLIVIA_LOCALE, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  })}`;
}

export function formatBoliviaDate(
  input: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }
): string {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleDateString(BOLIVIA_LOCALE, {
    timeZone: BOLIVIA_TIMEZONE,
    ...options,
  });
}

export function formatBoliviaDateTime(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  return date.toLocaleString(BOLIVIA_LOCALE, {
    timeZone: BOLIVIA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

