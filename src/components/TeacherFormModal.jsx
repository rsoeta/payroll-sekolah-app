import React from 'react';
import { Mail, Plus, Trash2, X } from 'lucide-react';
import {
  STAFF_CATEGORIES,
  formatRibuan,
  formatRupiah,
  parseRibuan,
  resolveStaffCategory,
  summarizeCustomComponents,
} from '../utils/formatters';

const CUSTOM_COMPONENT_PRESETS = [
  { type: 'deduction', label: 'Potongan Koperasi / Kasbon', amount: 100000 },
  { type: 'deduction', label: 'Cicilan Pinjaman Yayasan', amount: 200000 },
  { type: 'deduction', label: 'Potongan Keterlambatan', amount: 25000 },
  { type: 'allowance', label: 'Tunjangan Wali Kelas', amount: 150000 },
  { type: 'allowance', label: 'Tunjangan Transport & Makan', amount: 200000 },
];

export function TeacherFormModal({
  isOpen,
  isEditing,
  teacherForm,
  setTeacherForm,
  onAddCustomComponent,
  onUpdateCustomComponent,
  onRemoveCustomComponent,
  onSubmit,
  onClose,
}) {
  if (!isOpen) return null;

  const isInfaqEnabled = Boolean(teacherForm.infaq_zakat_enabled);
  const customSummary = summarizeCustomComponents(teacherForm.custom_components);
  const fixedNetBeforeInfaq = Math.max(
    0,
    Number(teacherForm.base_salary || 0) +
      Number(teacherForm.position_allowance || 0) +
      customSummary.totalCustomAllowance -
      customSummary.totalCustomDeduction
  );

  const currentCategory = resolveStaffCategory(teacherForm);

  const handleCategoryChange = (nextCategoryId) => {
    const categoryMeta =
      STAFF_CATEGORIES.find((c) => c.id === nextCategoryId) || STAFF_CATEGORIES[0];
    const currentStatusInTarget = categoryMeta.statusOptions.includes(teacherForm.status);
    setTeacherForm({
      ...teacherForm,
      staff_category: nextCategoryId,
      status: currentStatusInTarget ? teacherForm.status : categoryMeta.statusOptions[0],
    });
  };

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={
        isEditing ? 'Edit Data PTK & Komponen Gaji' : 'Tambah PTK & Komponen Gaji'
      }
    >
      <div className="nim-panel nim-modal w-full max-w-5xl p-4 sm:p-5 my-auto max-h-[92vh] overflow-y-auto">
        {/* Compact Modal Header */}
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--ink)]">
              {isEditing
                ? 'Edit Data PTK & Komponen Gaji'
                : 'Tambah PTK & Komponen Gaji'}
            </h3>
            <p className="text-[11px] text-[var(--muted)]">
              Formulir terpadu bagi Tenaga Pendidik (Guru) &amp; Tenaga Kependidikan (TU,
              Pustakawan, Laboran, Penguji, Keamanan, Kebersihan).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup formulir PTK"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-3.5 space-y-3.5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left Column: Teacher Identity, Gmail Access & Core Salary */}
            <div className="lg:col-span-6 space-y-3">
              {/* Identity & Gmail Card */}
              <div className="nim-card-well p-3.5 space-y-2.5">
                <p className="nim-kpi__label">Identitas, Kategori &amp; Akses Portal</p>

                {/* Radio Button Status Kategori: Tenaga Pendidik vs Tenaga Kependidikan */}
                <div>
                  <span className="block text-[11.5px] font-semibold text-[var(--ink-2)] mb-1">
                    Kategori PTK
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STAFF_CATEGORIES.map((cat) => {
                      const isSelected = currentCategory === cat.id;
                      return (
                        <label
                          key={cat.id}
                          className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/70 shadow-2xs'
                              : 'border-[var(--line)] bg-[var(--surface)] hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="staff_category"
                            value={cat.id}
                            checked={isSelected}
                            onChange={() => handleCategoryChange(cat.id)}
                            className="mt-0.5 h-3.5 w-3.5 accent-emerald-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-[var(--ink)]">
                              {cat.label}
                            </span>
                            <span className="block text-[10px] leading-tight text-[var(--muted)] line-clamp-2">
                              {cat.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      NIP / NIY
                    </label>
                    <input
                      type="text"
                      required
                      value={teacherForm.nip}
                      onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
                      placeholder="19900101202001"
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Nama Lengkap &amp; Gelar
                    </label>
                    <input
                      type="text"
                      required
                      value={teacherForm.name}
                      onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                      placeholder="Ahmad Fauzi, S.Pd."
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Status / Jabatan Tugas
                    </label>
                    <select
                      value={teacherForm.status}
                      onChange={(e) => setTeacherForm({ ...teacherForm, status: e.target.value })}
                      className="nim-select mt-1 !min-h-[34px] !py-1.5 text-xs"
                    >
                      {STAFF_CATEGORIES.map((cat) => (
                        <optgroup key={cat.id} label={cat.label}>
                          {cat.statusOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Bank &amp; Nomor Rekening
                    </label>
                    <input
                      type="text"
                      required
                      value={teacherForm.bank_account}
                      onChange={(e) =>
                        setTeacherForm({ ...teacherForm, bank_account: e.target.value })
                      }
                      placeholder="BSI 7192837465"
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs"
                    />
                  </div>
                </div>

                {/* Gmail Access Box */}
                <div
                  className="rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center gap-2"
                  style={{
                    background: 'var(--accent-soft)',
                    boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
                  }}
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Mail className="h-3.5 w-3.5 text-[var(--accent-text)]" />
                    <span className="text-[11.5px] font-bold text-[var(--ink)]">
                      Akun Google Portal:
                    </span>
                  </div>
                  <input
                    type="email"
                    value={teacherForm.email || ''}
                    onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                    placeholder="contoh: ahmad.fauzi@gmail.com"
                    className="nim-input flex-1 !min-h-[32px] !py-1 text-xs"
                  />
                </div>
              </div>

              {/* Base Salary Components Card */}
              <div className="nim-card-well p-3.5 space-y-2.5">
                <p className="nim-kpi__label">Rincian Komponen Gaji</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Gaji Pokok (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.base_salary)}
                      onChange={(e) =>
                        setTeacherForm({
                          ...teacherForm,
                          base_salary: parseRibuan(e.target.value),
                        })
                      }
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Tarif per JTM (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.hourly_rate)}
                      onChange={(e) =>
                        setTeacherForm({
                          ...teacherForm,
                          hourly_rate: parseRibuan(e.target.value),
                        })
                      }
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
                      Tunjangan Jabatan (Rp)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatRibuan(teacherForm.position_allowance)}
                      onChange={(e) =>
                        setTeacherForm({
                          ...teacherForm,
                          position_allowance: parseRibuan(e.target.value),
                        })
                      }
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 text-xs font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <label
                        htmlFor="teacher-infaq-checkbox"
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--ink-2)] cursor-pointer select-none"
                      >
                        <input
                          id="teacher-infaq-checkbox"
                          type="checkbox"
                          checked={isInfaqEnabled}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setTeacherForm({
                              ...teacherForm,
                              infaq_zakat_enabled: checked,
                              bpjs_deduction: checked ? 1 : 0,
                            });
                          }}
                          className="h-3.5 w-3.5 rounded accent-emerald-600"
                        />
                        <span>Infaq / Zakat Profesi (2,5%)</span>
                      </label>
                    </div>
                    <div
                      className="nim-input mt-1 !min-h-[34px] !py-1.5 px-2.5 flex items-center justify-between gap-2 text-xs"
                      style={{
                        background: isInfaqEnabled ? 'var(--good-soft)' : 'var(--surface)',
                        color: isInfaqEnabled ? 'var(--good-text)' : 'var(--muted)',
                      }}
                    >
                      <span className="text-[11px] font-bold truncate">
                        {isInfaqEnabled ? 'Aktif (Dipotong 2,5%)' : 'Tidak Aktif'}
                      </span>
                      <span className="text-[10.5px] font-semibold shrink-0">
                        {isInfaqEnabled ? 'Saat Payroll' : 'Rp 0'}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[10.5px] text-[var(--muted)] leading-snug">
                  Centang bila PTK bersedia dipotong <strong>2,5%</strong> dari{' '}
                  <strong>
                    Gaji Pokok + (JTM × Tarif) + Tunjangan Jabatan + Tunjangan Custom (Tunj +)
                  </strong>{' '}
                  pada Menu Alur Penggajian &amp; Slip Gaji.
                </p>
              </div>
            </div>

            {/* Right Column: Custom Deductions & Allowances */}
            <div className="lg:col-span-6">
              <div className="nim-card-well p-3.5 space-y-2.5 h-full flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[var(--ink)]">
                        Potongan &amp; Tunjangan Custom
                      </p>
                      <p className="text-[11px] text-[var(--muted)]">
                        Koperasi, kasbon, cicilan, atau tunjangan tambahan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddCustomComponent('deduction', '', 50000)}
                      className="nim-btn nim-btn--primary nim-btn--sm text-[11.5px]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah Item</span>
                    </button>
                  </div>

                  {/* Compact Quick Preset Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {CUSTOM_COMPONENT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          onAddCustomComponent(preset.type, preset.label, preset.amount)
                        }
                        className={`nim-btn nim-btn--sm text-[10.5px] ${
                          preset.type === 'allowance' ? 'nim-badge--good' : 'nim-badge--bad'
                        }`}
                      >
                        {preset.type === 'allowance' ? '+ ' : '− '}
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Dynamic Custom Items Rows */}
                  {(teacherForm.custom_components || []).length === 0 ? (
                    <p
                      className="rounded-xl px-3 py-4 text-center text-xs text-[var(--muted)]"
                      style={{ border: '1px dashed var(--line-2)' }}
                    >
                      Belum ada potongan atau tunjangan custom. Pilih preset di atas atau klik
                      &ldquo;Tambah Item&rdquo;.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {(teacherForm.custom_components || []).map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 rounded-xl p-2"
                          style={{
                            background: 'var(--card-2)',
                            boxShadow: 'inset 0 0 0 1px var(--line)',
                          }}
                        >
                          <select
                            aria-label="Jenis Komponen"
                            value={item.type}
                            onChange={(e) =>
                              onUpdateCustomComponent(item.id, 'type', e.target.value)
                            }
                            className="nim-select !w-auto !min-h-[32px] !py-1 !px-2 font-bold text-[11px]"
                            style={{
                              color:
                                item.type === 'allowance'
                                  ? 'var(--good-text)'
                                  : 'var(--bad-text)',
                            }}
                          >
                            <option value="deduction">Pot (−)</option>
                            <option value="allowance">Tunj (+)</option>
                          </select>

                          <input
                            type="text"
                            value={item.label}
                            onChange={(e) =>
                              onUpdateCustomComponent(item.id, 'label', e.target.value)
                            }
                            placeholder="Nama komponen (misal: Koperasi)"
                            className="nim-input flex-1 min-w-[120px] !min-h-[32px] !py-1 text-xs"
                          />

                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatRibuan(item.amount)}
                            onChange={(e) =>
                              onUpdateCustomComponent(
                                item.id,
                                'amount',
                                parseRibuan(e.target.value)
                              )
                            }
                            placeholder="Nominal"
                            className="nim-input !w-24 !min-h-[32px] !py-1 text-right text-xs font-bold tabular-nums"
                          />

                          <button
                            type="button"
                            onClick={() => onRemoveCustomComponent(item.id)}
                            aria-label="Hapus komponen custom"
                            className="nim-btn nim-btn--danger nim-btn--sm shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Salary Summary Bar */}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 pt-2.5 text-[11.5px]"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <span className="text-[var(--muted)]">
                    Potongan Custom:{' '}
                    <strong className="text-[var(--bad-text)] tabular-nums">
                      - {formatRupiah(customSummary.totalCustomDeduction)}
                    </strong>
                  </span>
                  <span className="text-[var(--muted)]">
                    Infaq 2,5%:{' '}
                    <strong
                      style={{ color: isInfaqEnabled ? 'var(--bad-text)' : 'var(--muted)' }}
                    >
                      {isInfaqEnabled ? 'Aktif (di Payroll)' : 'Tidak Aktif'}
                    </strong>
                  </span>
                  <span className="text-[var(--muted)]">
                    Basis Tetap:{' '}
                    <strong className="text-[var(--accent-text)] tabular-nums">
                      {formatRupiah(fixedNetBeforeInfaq)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Compact Action Footer */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 pt-3"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <p className="text-[11px] text-[var(--muted)]">
              Tenaga Pendidik maupun Tenaga Kependidikan masuk portal via alamat Gmail tanpa
              username &amp; password.
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="nim-btn text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                className="nim-btn nim-btn--primary text-xs"
              >
                Simpan Data
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TeacherFormModal;
