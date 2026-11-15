import React from 'react';
import { Mail, Plus, Trash2, X } from 'lucide-react';
import {
  formatRibuan,
  formatRupiah,
  parseRibuan,
  summarizeCustomComponents,
} from '../utils/formatters';

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

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Edit Data Guru & Komponen Gaji' : 'Tambah Guru & Komponen Gaji'}
    >
      <div className="nim-panel nim-modal w-full max-w-xl p-5 sm:p-6 my-auto max-h-[92vh] overflow-y-auto">
        <div
          className="flex items-center justify-between pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <h3 className="text-lg font-bold text-[var(--ink)]">
            {isEditing
              ? 'Edit Data Guru & Komponen Gaji'
              : 'Tambah Guru & Komponen Gaji'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup formulir guru"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="fluid-container">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">NIP / NIY</label>
              <input
                type="text"
                required
                value={teacherForm.nip}
                onChange={(e) => setTeacherForm({ ...teacherForm, nip: e.target.value })}
                placeholder="19900101202001"
                className="nim-input mt-1"
              />
            </div>
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Nama Lengkap &amp; Gelar
              </label>
              <input
                type="text"
                required
                value={teacherForm.name}
                onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                placeholder="Ahmad Fauzi, S.Pd."
                className="nim-input mt-1"
              />
            </div>
          </div>

          <div className="fluid-container">
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Status Kepegawaian
              </label>
              <select
                value={teacherForm.status}
                onChange={(e) => setTeacherForm({ ...teacherForm, status: e.target.value })}
                className="nim-select mt-1"
              >
                <option value="GTY (Guru Tetap Yayasan)">GTY (Guru Tetap Yayasan)</option>
                <option value="GTT (Guru Tidak Tetap)">GTT (Guru Tidak Tetap)</option>
                <option value="PNS DPK">PNS DPK</option>
                <option value="Staf Tata Usaha">Staf Tata Usaha</option>
              </select>
            </div>
            <div className="fluid-item-sm">
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
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
                className="nim-input mt-1"
              />
            </div>
          </div>

          <div
            className="rounded-xl p-3.5 space-y-2"
            style={{
              background: 'var(--accent-soft)',
              boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-[var(--accent-text)]" />
              <p className="text-xs font-bold text-[var(--ink)]">
                Akun Akses Portal Guru (Gmail)
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--ink-2)]">
                Alamat Gmail Guru
              </label>
              <input
                type="email"
                value={teacherForm.email || ''}
                onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                placeholder="contoh: ahmad.fauzi@gmail.com"
                className="nim-input mt-1"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Guru cukup masuk menggunakan alamat Gmail ini tanpa perlu username dan password.
              </p>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <p className="nim-kpi__label mb-3">Rincian Komponen Gaji</p>
            <div className="fluid-container">
              <div className="fluid-item-sm">
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
                  Gaji Pokok (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatRibuan(teacherForm.base_salary)}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, base_salary: parseRibuan(e.target.value) })
                  }
                  className="nim-input mt-1 font-semibold tabular-nums"
                />
              </div>
              <div className="fluid-item-sm">
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
                  Tarif Mengajar per JTM (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatRibuan(teacherForm.hourly_rate)}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, hourly_rate: parseRibuan(e.target.value) })
                  }
                  className="nim-input mt-1 font-semibold tabular-nums"
                />
              </div>
              <div className="fluid-item-sm">
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
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
                  className="nim-input mt-1 font-semibold tabular-nums"
                />
              </div>
              <div className="fluid-item-sm">
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
                  Potongan BPJS (Rp)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatRibuan(teacherForm.bpjs_deduction)}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, bpjs_deduction: parseRibuan(e.target.value) })
                  }
                  className="nim-input mt-1 font-semibold tabular-nums"
                />
              </div>
            </div>

            {/* Custom Deductions & Allowances Section */}
            <div className="nim-card-well mt-4 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[var(--ink)]">
                    Potongan &amp; Komponen Lainnya (Custom Admin)
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    Tambahkan potongan selain BPJS (misal Koperasi, Kasbon, Infaq, PPh 21) atau
                    tunjangan tambahan sesuai kebijakan sekolah.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAddCustomComponent('deduction', '', 50000)}
                  className="nim-btn nim-btn--primary !min-h-[34px] text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Item Custom</span>
                </button>
              </div>

              {/* Quick Preset Chips */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { type: 'deduction', label: 'Potongan Koperasi / Kasbon', amount: 100000 },
                  { type: 'deduction', label: 'Cicilan Pinjaman Yayasan', amount: 200000 },
                  { type: 'deduction', label: 'Infaq / Zakat Profesi', amount: 50000 },
                  { type: 'deduction', label: 'Potongan Keterlambatan', amount: 25000 },
                  { type: 'allowance', label: 'Tunjangan Wali Kelas', amount: 150000 },
                  { type: 'allowance', label: 'Tunjangan Transport & Makan', amount: 200000 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onAddCustomComponent(preset.type, preset.label, preset.amount)}
                    className={`nim-btn !min-h-[30px] !px-2.5 text-[11px] ${
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
                  className="rounded-xl px-3 py-2.5 text-center text-xs text-[var(--muted)]"
                  style={{ border: '1px dashed var(--line-2)' }}
                >
                  Belum ada potongan atau tunjangan custom tambahan. Ketuk tombol preset di atas
                  atau &ldquo;Tambah Item Custom&rdquo;.
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {(teacherForm.custom_components || []).map((item) => (
                    <div
                      key={item.id}
                      className="fluid-container items-center gap-2 rounded-xl p-2.5"
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
                        className="nim-select !w-auto font-bold text-xs"
                        style={{
                          color: item.type === 'allowance' ? 'var(--good-text)' : 'var(--bad-text)',
                        }}
                      >
                        <option value="deduction">Potongan (−)</option>
                        <option value="allowance">Tunjangan (+)</option>
                      </select>

                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) =>
                          onUpdateCustomComponent(item.id, 'label', e.target.value)
                        }
                        placeholder="Nama potongan/tunjangan (misal: Koperasi)"
                        className="fluid-item-xs nim-input text-xs"
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
                        placeholder="Nominal (Rp)"
                        className="nim-input !w-32 text-right text-xs font-bold tabular-nums"
                      />

                      <button
                        type="button"
                        onClick={() => onRemoveCustomComponent(item.id)}
                        aria-label="Hapus komponen custom"
                        className="nim-btn nim-btn--danger !px-2.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {(() => {
                const summary = summarizeCustomComponents(teacherForm.custom_components);
                const totalDeductions =
                  Number(teacherForm.bpjs_deduction || 0) + summary.totalCustomDeduction;
                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 pt-2.5 text-xs"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <span className="text-[var(--muted)]">
                      Total Potongan (BPJS + Custom):{' '}
                      <strong className="text-[var(--bad-text)] tabular-nums">
                        - {formatRupiah(totalDeductions)}
                      </strong>
                    </span>
                    {summary.totalCustomAllowance > 0 && (
                      <span className="text-[var(--muted)]">
                        Tunjangan Custom:{' '}
                        <strong className="text-[var(--good-text)] tabular-nums">
                          + {formatRupiah(summary.totalCustomAllowance)}
                        </strong>
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="fluid-container pt-3 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="fluid-item-xs nim-btn"
            >
              Batal
            </button>
            <button type="submit" className="fluid-item-xs nim-btn nim-btn--primary">
              Simpan Data
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TeacherFormModal;
