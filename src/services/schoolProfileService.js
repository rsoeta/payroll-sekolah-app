import api, { isLiveGasMode } from './gasApi';
import { emitDataChange } from './realtimeSync';
import { sanitizeClientString } from '../utils/formatters';

const PROFILE_STORAGE_KEY = 'sipayroll_school_profile_v1';

export const DEFAULT_SCHOOL_PROFILE = {
  app_short_name: 'SIPAYROLL',
  foundation_name: 'YAYASAN PENDIDIKAN NUSANTARA',
  school_name: 'SMA Islam Terpadu Nusantara',
  address: 'Jl. Pendidikan Raya No. 45, Kota Bandung, Jawa Barat',
  contact_info: 'Telp: (022) 7201234 • Email: bendahara@nusantara.sch.id',
  city: 'Bandung',
  principal_name: 'Hj. Ratna Sari, M.Pd.',
  principal_nip: '19780412 200501 2 001',
  treasurer_name: 'Drs. H. Ahmad Hidayat',
  treasurer_nip: '19810820 200801 1 004',
  slip_footer_note:
    'Dokumen ini diterbitkan secara resmi dan sah oleh Sistem Penggajian Sekolah / Yayasan.',
  logo_data_url: '/logo.png',
  google_client_id: '',
};

const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PROFILE_STORAGE_KEY && e.newValue) {
      const next = getSchoolProfile();
      applyProfileToDocumentHead(next);
      listeners.forEach((cb) => cb(next));
    }
  });
}

export function getSchoolProfile() {
  if (typeof window === 'undefined') return { ...DEFAULT_SCHOOL_PROFILE };
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCHOOL_PROFILE };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SCHOOL_PROFILE,
      ...parsed,
      logo_data_url: parsed?.logo_data_url || DEFAULT_SCHOOL_PROFILE.logo_data_url,
    };
  } catch {
    return { ...DEFAULT_SCHOOL_PROFILE };
  }
}

function applyProfileToDocumentHead(profile) {
  if (typeof document === 'undefined') return;
  const appTitle = profile.app_short_name || 'SIPAYROLL';
  const orgTitle = profile.school_name || profile.foundation_name || 'Sistem Penggajian Sekolah';
  document.title = `${appTitle} — ${orgTitle}`;

  if (profile.logo_data_url) {
    const icons = document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']");
    icons.forEach((link) => {
      link.setAttribute('href', profile.logo_data_url);
    });
  }
}

function notifyProfileListeners(profile) {
  applyProfileToDocumentHead(profile);
  listeners.forEach((cb) => cb(profile));
}

export function subscribeSchoolProfile(callback) {
  listeners.add(callback);
  const current = getSchoolProfile();
  applyProfileToDocumentHead(current);
  callback(current);
  return () => {
    listeners.delete(callback);
  };
}

export function saveLocalSchoolProfile(partialProfile) {
  const current = getSchoolProfile();
  const merged = {
    ...current,
    app_short_name:
      sanitizeClientString(partialProfile.app_short_name ?? current.app_short_name) ||
      DEFAULT_SCHOOL_PROFILE.app_short_name,
    foundation_name:
      sanitizeClientString(partialProfile.foundation_name ?? current.foundation_name) ||
      DEFAULT_SCHOOL_PROFILE.foundation_name,
    school_name:
      sanitizeClientString(partialProfile.school_name ?? current.school_name) ||
      DEFAULT_SCHOOL_PROFILE.school_name,
    address: sanitizeClientString(partialProfile.address ?? current.address),
    contact_info: sanitizeClientString(partialProfile.contact_info ?? current.contact_info),
    city: sanitizeClientString(partialProfile.city ?? current.city) || 'Bandung',
    principal_name: sanitizeClientString(partialProfile.principal_name ?? current.principal_name),
    principal_nip: sanitizeClientString(partialProfile.principal_nip ?? current.principal_nip),
    treasurer_name: sanitizeClientString(partialProfile.treasurer_name ?? current.treasurer_name),
    treasurer_nip: sanitizeClientString(partialProfile.treasurer_nip ?? current.treasurer_nip),
    slip_footer_note:
      sanitizeClientString(partialProfile.slip_footer_note ?? current.slip_footer_note) ||
      DEFAULT_SCHOOL_PROFILE.slip_footer_note,
    logo_data_url:
      partialProfile.logo_data_url !== undefined
        ? String(partialProfile.logo_data_url || '/logo.png').trim()
        : current.logo_data_url,
    google_client_id: sanitizeClientString(
      partialProfile.google_client_id ?? current.google_client_id
    ),
  };

  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(merged));
  notifyProfileListeners(merged);
  return merged;
}

export async function fetchSchoolProfileFromServer() {
  try {
    const remote = await api.get('schoolProfile.get');
    if (
      remote &&
      typeof remote === 'object' &&
      (remote.school_name || remote.foundation_name || remote.google_client_id)
    ) {
      return saveLocalSchoolProfile(remote);
    }
  } catch {
    // Graceful fallback if GAS backend is on an older version without schoolProfile.get
  }
  return getSchoolProfile();
}

export async function updateSchoolProfile(nextProfile) {
  const savedLocal = saveLocalSchoolProfile(nextProfile);
  if (isLiveGasMode()) {
    try {
      await api.put('schoolProfile.update', savedLocal);
    } catch {
      // Graceful fallback if GAS Web App has not been redeployed to v6_SchoolProfile yet;
      // local profile is already persisted and active immediately.
    }
  } else {
    try {
      await api.put('schoolProfile.update', savedLocal);
    } catch {
      // Ignore
    }
  }
  emitDataChange(['school_profile'], { source: 'local' });
  return savedLocal;
}

export function resetSchoolProfileToDefault() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(DEFAULT_SCHOOL_PROFILE));
  notifyProfileListeners({ ...DEFAULT_SCHOOL_PROFILE });
  return { ...DEFAULT_SCHOOL_PROFILE };
}

/**
 * Resizes and compresses an uploaded image File into a crisp square/proportional PNG Data URL
 * (max 240x240) so it renders sharply in PDF salary slips and fits easily in storage.
 */
export function processLogoImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Pilih file gambar yang valid (PNG, JPG, WEBP, atau SVG).'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 240;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png', 0.92);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Gagal memproses file gambar logo.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file dari perangkat.'));
    reader.readAsDataURL(file);
  });
}
