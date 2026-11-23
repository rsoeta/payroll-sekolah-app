import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Upload,
  RotateCcw,
  Save,
  FileDown,
  MapPin,
  Phone,
  ShieldCheck,
  UserCheck,
  Image as ImageIcon,
} from 'lucide-react';
import {
  getSchoolProfile,
  updateSchoolProfile,
  resetSchoolProfileToDefault,
  processLogoImageFile,
} from '../services/schoolProfileService';
import { resolveGoogleClientId } from '../utils/googleOAuth';
import { downloadPayslipPdf } from '../utils/pdfSlipLoader';
import notify from '../utils/notify';

function loadProfileWithResolvedClientId() {
  const prof = getSchoolProfile();
  return {
    ...prof,
    google_client_id: resolveGoogleClientId(prof) || prof.google_client_id || '',
  };
}

export function SchoolProfileSection() {
  const [form, setForm] = useState(loadProfileWithResolvedClientId);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setForm(loadProfileWithResolvedClientId());
  }, []);

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await processLogoImageFile(file);
      setForm((prev) => ({
        ...prev,
        logo_data_url: compressedDataUrl,
      }));
      notify.info('Logo baru berhasil dimuat. Klik "Simpan Profil Sekolah" untuk menerapkan.');
    } catch (err) {
      notify.error(err.message || 'Gagal memproses gambar logo.');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.foundation_name.trim() && !form.school_name.trim()) {
      notify.warn('Nama Yayasan atau Nama Sekolah wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSchoolProfile(form);
      setForm(updated);
      notify.success('Profil & Identitas Sekolah/Yayasan berhasil disimpan!');
    } catch (err) {
      notify.error(err.message || 'Gagal menyimpan profil sekolah.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    const reset = resetSchoolProfileToDefault();
    setForm(reset);
    notify.info('Profil sekolah dikembalikan ke pengaturan awal.');
  };

  const handleTestDownloadPdf = async () => {
    const sampleSlip = {
      id: 'SLIP-CONTOH-2026',
      month: 11,
      year: 2026,
      net_salary: 4990000,
      details_json: JSON.stringify({
        teacher_name: 'Budi Santoso, S.Pd.',
        nip: '19870512201504',
        status: 'GTY (Guru Tetap Yayasan)',
        bank_account: 'BRI 0012-3456-7890',
        month: 11,
        year: 2026,
        present_days: 22,
        absent_days: 0,
        total_jtm: 24,
        base_salary: 3500000,
        hourly_rate: 50000,
        jtm_honor: 1200000,
        position_allowance: 450000,
        infaq_zakat_enabled: true,
        infaq_zakat: 128750,
        bpjs_deduction: 128750,
        custom_components: [],
        gross_salary: 5150000,
        net_salary: 5021250,
      }),
    };
    await downloadPayslipPdf(sampleSlip, form);
    notify.success('Contoh Slip Gaji PDF dengan identitas terbaru berhasil diunduh!');
  };

  return (
    <section className="space-y-4">
      {/* Header Action Bar */}
      <div className="nim-glass nim-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="nim-kpi__ico">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              Pengaturan Identitas Sekolah &amp; Yayasan
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Atur nama yayasan, nama sekolah, alamat, logo, dan pejabat penandatangan yang ditampilkan
              pada header aplikasi serta dokumen Slip Gaji PDF.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTestDownloadPdf}
            className="nim-btn"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent-text)',
              boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>Tes Unduh Slip PDF</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefault}
            className="nim-btn"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Awal</span>
          </button>
        </div>
      </div>

      {/* Live Preview of Kop Slip Gaji PDF */}
      <div className="nim-glass nim-card space-y-3">
        <div className="flex items-center justify-between">
          <span className="nim-kpi__label">
            Pratinjau Kop &amp; Pengesahan Slip Gaji PDF
          </span>
          <span className="nim-badge nim-badge--good">Live Preview</span>
        </div>

        {/* Simulated Printed Paper Document */}
        <div
          className="overflow-hidden rounded-xl shadow-md"
          style={{ border: '1px solid var(--line-2)' }}
        >
          <div className="flex items-center gap-3.5 bg-[#19381f] p-3.5 sm:p-4 text-white">
            <img
              src={form.logo_data_url || '/logo.png'}
              alt="Logo Sekolah"
              onError={(e) => {
                e.currentTarget.src = '/logo.png';
              }}
              className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl bg-white/10 object-contain p-0.5 border border-white/20"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-white truncate">
                {form.foundation_name || 'NAMA YAYASAN PENDIDIKAN'}
              </p>
              <p className="text-xs font-semibold text-emerald-200 truncate">
                {form.school_name || 'Nama Sekolah / Unit Pendidikan'}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-300 truncate">
                {[form.address, form.contact_info].filter(Boolean).join(' • ') ||
                  'Alamat Lengkap Sekolah / Yayasan'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-white p-3.5 sm:p-4 text-xs border-t border-slate-200">
            <div>
              <p className="text-slate-500">Mengetahui,</p>
              <p className="text-slate-600 font-medium">Kepala Sekolah</p>
              <p className="mt-5 font-bold text-slate-900">
                {form.principal_name || 'Nama Kepala Sekolah'}
              </p>
              {form.principal_nip && (
                <p className="text-[10px] text-slate-500">NIP/NIY: {form.principal_nip}</p>
              )}
            </div>
            <div className="text-right sm:text-left sm:pl-8">
              <p className="text-slate-500">
                {form.city || 'Kota'},{' '}
                {new Date().toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <p className="text-slate-600 font-medium">Bendahara Sekolah / Yayasan</p>
              <p className="mt-5 font-bold text-slate-900">
                {form.treasurer_name || 'Nama Bendahara'}
              </p>
              {form.treasurer_nip && (
                <p className="text-[10px] text-slate-500">NIP/NIY: {form.treasurer_nip}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Configuration Form */}
      <form onSubmit={handleSave} className="nim-glass nim-card space-y-5">
        {/* 1. Logo Sekolah / Yayasan */}
        <div className="space-y-3 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--ink)]">Logo Sekolah / Yayasan</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <img
              src={form.logo_data_url || '/logo.png'}
              alt="Pratinjau Logo"
              onError={(e) => {
                e.currentTarget.src = '/logo.png';
              }}
              className="h-16 w-16 rounded-2xl object-contain p-1"
              style={{
                background: 'var(--card-3)',
                boxShadow: 'inset 0 0 0 1px var(--glass-rim)',
              }}
            />

            <div className="flex-1 min-w-[220px] space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="nim-btn nim-btn--primary"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Unggah Gambar Logo</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFieldChange('logo_data_url', '/logo.png')}
                  className="nim-btn"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Gunakan Logo Bawaan</span>
                </button>
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                Mendukung format PNG, JPG, atau WEBP. Gambar otomatis dioptimalkan untuk Header &amp;
                Slip Gaji PDF.
              </p>
            </div>
          </div>
        </div>

        {/* 2. Identitas Utama Institusi */}
        <div className="space-y-3 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--ink)]">
              Identitas Yayasan &amp; Unit Sekolah
            </h3>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Yayasan / Badan Penyelenggara
              </label>
              <input
                type="text"
                value={form.foundation_name}
                onChange={(e) => handleFieldChange('foundation_name', e.target.value)}
                placeholder="Contoh: YAYASAN PENDIDIKAN NUSANTARA"
                className="nim-input mt-1 font-semibold"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Sekolah / Madrasah / Unit
              </label>
              <input
                type="text"
                value={form.school_name}
                onChange={(e) => handleFieldChange('school_name', e.target.value)}
                placeholder="Contoh: SMA Islam Terpadu Nusantara"
                className="nim-input mt-1 font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Singkat Portal
              </label>
              <input
                type="text"
                value={form.app_short_name}
                onChange={(e) => handleFieldChange('app_short_name', e.target.value)}
                placeholder="SIPAYROLL"
                className="nim-input mt-1 font-semibold"
              />
            </div>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item">
              <label className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-2)]">
                <MapPin className="h-3.5 w-3.5 text-[var(--muted)]" />
                <span>Alamat Lengkap Sekolah / Yayasan</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                placeholder="Jl. Pendidikan Raya No. 45, Kota Bandung, Jawa Barat"
                className="nim-input mt-1"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="flex items-center gap-1 text-xs font-semibold text-[var(--ink-2)]">
                <Phone className="h-3.5 w-3.5 text-[var(--muted)]" />
                <span>Kontak Telepon &amp; Email</span>
              </label>
              <input
                type="text"
                value={form.contact_info}
                onChange={(e) => handleFieldChange('contact_info', e.target.value)}
                placeholder="Telp: (022) 7201234 • Email: info@sekolah.sch.id"
                className="nim-input mt-1"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Kota Penerbitan Slip
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                placeholder="Bandung"
                className="nim-input mt-1"
              />
            </div>
          </div>
        </div>

        {/* 3. Pejabat Penandatangan Slip Gaji PDF */}
        <div className="space-y-3 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold text-[var(--ink)]">
              Pejabat Penandatangan Slip Gaji &amp; Catatan Dokumen
            </h3>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Kepala Sekolah
              </label>
              <input
                type="text"
                value={form.principal_name}
                onChange={(e) => handleFieldChange('principal_name', e.target.value)}
                placeholder="Hj. Ratna Sari, M.Pd."
                className="nim-input mt-1 font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                NIP / NIY Kepala Sekolah
              </label>
              <input
                type="text"
                value={form.principal_nip}
                onChange={(e) => handleFieldChange('principal_nip', e.target.value)}
                placeholder="19780412 200501 2 001"
                className="nim-input mt-1"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Bendahara Sekolah / Yayasan
              </label>
              <input
                type="text"
                value={form.treasurer_name}
                onChange={(e) => handleFieldChange('treasurer_name', e.target.value)}
                placeholder="Drs. H. Ahmad Hidayat"
                className="nim-input mt-1 font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                NIP / NIY Bendahara
              </label>
              <input
                type="text"
                value={form.treasurer_nip}
                onChange={(e) => handleFieldChange('treasurer_nip', e.target.value)}
                placeholder="19810820 200801 1 004"
                className="nim-input mt-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-2)]">
              Catatan Kaki (Footer) Slip Gaji PDF
            </label>
            <input
              type="text"
              value={form.slip_footer_note}
              onChange={(e) => handleFieldChange('slip_footer_note', e.target.value)}
              placeholder="Dokumen ini diterbitkan secara resmi dan sah oleh Sistem Penggajian Sekolah / Yayasan."
              className="nim-input mt-1"
            />
          </div>
        </div>

        {/* 4. Pengaturan Masuk dengan Akun Google */}
        <div className="space-y-3 pb-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--good-text)]" />
            <h3 className="text-sm font-bold text-[var(--ink)]">
              Pengaturan Masuk dengan Akun Google
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--ink-2)]">
              ID Aplikasi Masuk Google (Client ID)
            </label>
            <input
              type="text"
              value={form.google_client_id || ''}
              onChange={(e) => handleFieldChange('google_client_id', e.target.value.trim())}
              placeholder="1234567890-xxxx.apps.googleusercontent.com"
              className="nim-input mt-1 font-mono text-xs"
            />
            <p className="mt-1.5 text-[11px] text-[var(--muted)] leading-relaxed">
              Diatur satu kali oleh pengelola sistem agar seluruh pengguna dapat masuk dengan Akun
              Google di alamat{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--card-2)] text-[var(--ink)]">
                {typeof window !== 'undefined' ? window.location.origin : ''}
              </code>
              . Hanya akun email yang telah didaftarkan oleh Admin Sekolah yang diizinkan mengakses
              portal.
            </p>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="nim-btn nim-btn--primary"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Profil Sekolah / Yayasan'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}

export default SchoolProfileSection;
