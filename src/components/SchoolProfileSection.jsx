import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Upload,
  RotateCcw,
  Save,
  FileDown,
  MapPin,
  Phone,
  UserCheck,
  Image as ImageIcon,
} from 'lucide-react';
import {
  getSchoolProfile,
  updateSchoolProfile,
  resetSchoolProfileToDefault,
  processLogoImageFile,
} from '../services/schoolProfileService';
import { downloadPayslipPdf } from '../utils/pdfSlipGenerator';
import notify from '../utils/notify';

export function SchoolProfileSection() {
  const [form, setForm] = useState(() => getSchoolProfile());
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setForm(getSchoolProfile());
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
        bpjs_deduction: 160000,
        custom_components: [],
        gross_salary: 5150000,
        net_salary: 4990000,
      }),
    };
    await downloadPayslipPdf(sampleSlip, form);
    notify.success('Contoh Slip Gaji PDF dengan identitas terbaru berhasil diunduh!');
  };

  return (
    <section className="space-y-4">
      {/* Header Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              Pengaturan Identitas Sekolah & Yayasan
            </h2>
            <p className="text-xs text-slate-500">
              Atur nama yayasan, nama sekolah, alamat, logo, dan pejabat penandatangan yang ditampilkan
              pada header aplikasi serta dokumen Slip Gaji PDF.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleTestDownloadPdf}
            className="touch-target flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>Tes Unduh Slip PDF</span>
          </button>

          <button
            type="button"
            onClick={handleResetDefault}
            className="touch-target flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Awal</span>
          </button>
        </div>
      </div>

      {/* Live Preview of Kop Slip Gaji PDF */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Pratinjau Kop & Pengesahan Slip Gaji PDF
          </span>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Live Preview
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-2xs">
          {/* Simulated Green PDF Header */}
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

          {/* Simulated PDF Signatories Footer */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-3.5 sm:p-4 text-xs border-t border-slate-200">
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
      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-5"
      >
        {/* 1. Logo Sekolah / Yayasan */}
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Logo Sekolah / Yayasan</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <img
              src={form.logo_data_url || '/logo.png'}
              alt="Pratinjau Logo"
              onError={(e) => {
                e.currentTarget.src = '/logo.png';
              }}
              className="h-16 w-16 rounded-2xl border border-slate-200 bg-slate-50 object-contain p-1 shadow-2xs"
            />

            <div className="flex-1 min-w-[220px] space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="touch-target flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Unggah Gambar Logo</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFieldChange('logo_data_url', '/logo.png')}
                  className="touch-target flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Gunakan Logo Bawaan</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Mendukung format PNG, JPG, atau WEBP. Gambar otomatis dioptimalkan untuk Header & Slip
                Gaji PDF.
              </p>
            </div>
          </div>
        </div>

        {/* 2. Identitas Utama Institusi */}
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Identitas Yayasan & Unit Sekolah</h3>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Yayasan / Badan Penyelenggara
              </label>
              <input
                type="text"
                value={form.foundation_name}
                onChange={(e) => handleFieldChange('foundation_name', e.target.value)}
                placeholder="Contoh: YAYASAN PENDIDIKAN NUSANTARA"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Sekolah / Madrasah / Unit
              </label>
              <input
                type="text"
                value={form.school_name}
                onChange={(e) => handleFieldChange('school_name', e.target.value)}
                placeholder="Contoh: SMA Islam Terpadu Nusantara"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Singkat Portal
              </label>
              <input
                type="text"
                value={form.app_short_name}
                onChange={(e) => handleFieldChange('app_short_name', e.target.value)}
                placeholder="SIPAYROLL"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item">
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span>Alamat Lengkap Sekolah / Yayasan</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                placeholder="Jl. Pendidikan Raya No. 45, Kota Bandung, Jawa Barat"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <span>Kontak Telepon & Email</span>
              </label>
              <input
                type="text"
                value={form.contact_info}
                onChange={(e) => handleFieldChange('contact_info', e.target.value)}
                placeholder="Telp: (022) 7201234 • Email: info@sekolah.sch.id"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-slate-700">
                Kota Penerbitan Slip
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                placeholder="Bandung"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>

        {/* 3. Pejabat Penandatangan Slip Gaji PDF */}
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">
              Pejabat Penandatangan Slip Gaji & Catatan Dokumen
            </h3>
          </div>

          <div className="fluid-container gap-3">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Kepala Sekolah
              </label>
              <input
                type="text"
                value={form.principal_name}
                onChange={(e) => handleFieldChange('principal_name', e.target.value)}
                placeholder="Hj. Ratna Sari, M.Pd."
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-slate-700">
                NIP / NIY Kepala Sekolah
              </label>
              <input
                type="text"
                value={form.principal_nip}
                onChange={(e) => handleFieldChange('principal_nip', e.target.value)}
                placeholder="19780412 200501 2 001"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-slate-700">
                Nama Bendahara Sekolah / Yayasan
              </label>
              <input
                type="text"
                value={form.treasurer_name}
                onChange={(e) => handleFieldChange('treasurer_name', e.target.value)}
                placeholder="Drs. H. Ahmad Hidayat"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>

            <div className="fluid-item-xs">
              <label className="block text-xs font-semibold text-slate-700">
                NIP / NIY Bendahara
              </label>
              <input
                type="text"
                value={form.treasurer_nip}
                onChange={(e) => handleFieldChange('treasurer_nip', e.target.value)}
                placeholder="19810820 200801 1 004"
                className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Catatan Kaki (Footer) Slip Gaji PDF
            </label>
            <input
              type="text"
              value={form.slip_footer_note}
              onChange={(e) => handleFieldChange('slip_footer_note', e.target.value)}
              placeholder="Dokumen ini diterbitkan secara resmi dan sah oleh Sistem Penggajian Sekolah / Yayasan."
              className="touch-target mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={saving}
            className="touch-target flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
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
