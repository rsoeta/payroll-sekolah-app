import React, { useState, useEffect } from 'react';
import { Calculator, X, Check, Delete, RotateCcw, CalendarRange, Hash } from 'lucide-react';
import { formatRupiah, formatRibuan } from '../utils/formatters';

/**
 * Safe Mathematical Expression Evaluator (DevSecOps: Zero `eval()` / `Function()`).
 * Supports addition (+), subtraction (-), multiplication (*, ×, x), division (/, ÷), and parentheses.
 */
function evaluateSafeMathExpression(expr) {
  if (!expr || typeof expr !== 'string') return 0;
  const normalized = expr
    .replace(/×/g, '*')
    .replace(/x/gi, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '.')
    .replace(/[^0-9+\-*/().\s]/g, '')
    .trim();

  if (!normalized) return 0;

  try {
    // Tokenize numbers and operators
    const tokens = normalized.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
    if (!tokens || tokens.length === 0) return 0;

    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const values = [];
    const ops = [];

    const applyOp = () => {
      const op = ops.pop();
      const b = values.pop() ?? 0;
      const a = values.pop() ?? 0;
      switch (op) {
        case '+':
          values.push(a + b);
          break;
        case '-':
          values.push(a - b);
          break;
        case '*':
          values.push(a * b);
          break;
        case '/':
          values.push(b !== 0 ? a / b : 0);
          break;
        default:
          break;
      }
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!Number.isNaN(Number(token))) {
        values.push(Number(token));
      } else if (token === '(') {
        ops.push(token);
      } else if (token === ')') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
          applyOp();
        }
        ops.pop();
      } else if (precedence[token]) {
        // Handle unary minus at start or after '('
        if (token === '-' && (i === 0 || tokens[i - 1] === '(' || precedence[tokens[i - 1]])) {
          values.push(0);
        }
        while (
          ops.length > 0 &&
          ops[ops.length - 1] !== '(' &&
          precedence[ops[ops.length - 1]] >= precedence[token]
        ) {
          applyOp();
        }
        ops.push(token);
      }
    }

    while (ops.length > 0) {
      if (ops[ops.length - 1] === '(') {
        ops.pop();
      } else {
        applyOp();
      }
    }

    const result = values.length > 0 ? Math.round(values[values.length - 1]) : 0;
    if (!Number.isFinite(result)) return 0;
    return Math.min(200, Math.max(0, result));
  } catch {
    return 0;
  }
}

/**
 * Mobile-First Interactive JTM Calculator Modal
 * Helps Admin calculate Total JTM via:
 * 1. Keypad / Class Hours Expression (e.g., 6 + 6 + 4 + 8 or 6 × 4)
 * 2. Weekly Schedule Formula (JTM/Minggu × Minggu Efektif + Tambahan - Izin/Alpa)
 */
export function JtmCalculatorModal({
  isOpen,
  teacher,
  initialJtm = 0,
  onApply,
  onClose,
}) {
  const [mode, setMode] = useState('keypad'); // 'keypad' | 'weekly'
  const [expression, setExpression] = useState(String(initialJtm || ''));

  // Weekly mode state
  const [weeklyJtm, setWeeklyJtm] = useState(6);
  const [effectiveWeeks, setEffectiveWeeks] = useState(4);
  const [extraHours, setExtraHours] = useState(0);
  const [deductedHours, setDeductedHours] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const startVal = Number(initialJtm || 0);
      setExpression(startVal > 0 ? String(startVal) : '');
      setWeeklyJtm(startVal > 0 && startVal % 4 === 0 ? startVal / 4 : 6);
      setEffectiveWeeks(4);
      setExtraHours(0);
      setDeductedHours(0);
    }
  }, [isOpen, initialJtm]);

  if (!isOpen || !teacher) return null;

  const hourlyRate = Number(teacher.salary_component?.hourly_rate || 0);

  const calculatedKeypadJtm = evaluateSafeMathExpression(expression);
  const calculatedWeeklyJtm = Math.min(
    200,
    Math.max(
      0,
      Math.round(
        Number(weeklyJtm || 0) * Number(effectiveWeeks || 0) +
          Number(extraHours || 0) -
          Number(deductedHours || 0)
      )
    )
  );

  const finalJtm = mode === 'keypad' ? calculatedKeypadJtm : calculatedWeeklyJtm;
  const estimatedHonor = finalJtm * hourlyRate;

  const appendToken = (token) => {
    setExpression((prev) => {
      if (prev === '0' && !['+', '-', '×', '÷'].includes(token)) {
        return String(token);
      }
      return `${prev}${token}`;
    });
  };

  const handleBackspace = () => {
    setExpression((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setExpression('');
  };

  const handleEvaluateToNumber = () => {
    setExpression(String(calculatedKeypadJtm));
  };

  const handleConfirm = () => {
    onApply(finalJtm);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jtm-calc-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-100 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h3 id="jtm-calc-title" className="text-base font-bold text-slate-900">
                Kalkulator Total JTM
              </h3>
              <p className="text-xs text-slate-500">
                {teacher.name} • {formatRupiah(hourlyRate)}/JTM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kalkulator"
            className="touch-target flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="fluid-container mt-3 gap-2">
          <button
            type="button"
            onClick={() => setMode('keypad')}
            className={`fluid-item-xs touch-target flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              mode === 'keypad'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Hash className="h-4 w-4" />
            <span>Kalkulator Angka</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('weekly')}
            className={`fluid-item-xs touch-target flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              mode === 'weekly'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            <span>Rumus Mingguan</span>
          </button>
        </div>

        {/* Live Result Display Screen */}
        <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-950 p-4 text-white">
          <div className="flex items-center justify-between text-xs text-indigo-300">
            <span>
              {mode === 'keypad'
                ? 'Ekspresi (Ketik atau gunakan tombol):'
                : `(${weeklyJtm} JTM × ${effectiveWeeks} mgg) + ${extraHours} - ${deductedHours}`}
            </span>
            <span className="font-semibold text-emerald-300">Maks 200 Jam</span>
          </div>

          {mode === 'keypad' && (
            <input
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="Contoh: 6 + 6 + 4 + 8 atau 6 * 4"
              aria-label="Ekspresi perhitungan JTM"
              className="touch-target mt-1.5 w-full rounded-xl border border-indigo-700 bg-indigo-900/70 px-3 py-2 text-right text-lg font-mono font-bold text-white placeholder:text-indigo-400/60 focus:border-indigo-400 focus:outline-none"
            />
          )}

          <div className="mt-3 flex items-baseline justify-between border-t border-indigo-800/80 pt-2.5">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-indigo-300 block">
                Estimasi Honor JTM
              </span>
              <span className="text-sm font-bold text-emerald-400">
                {formatRupiah(estimatedHonor)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-indigo-300 block">
                Hasil Total JTM
              </span>
              <span className="text-2xl font-extrabold text-white">
                {formatRibuan(finalJtm)} <span className="text-xs font-normal text-indigo-200">Jam</span>
              </span>
            </div>
          </div>
        </div>

        {/* MODE 1: KEYPAD CALCULATOR */}
        {mode === 'keypad' && (
          <div className="mt-3 space-y-2.5">
            {/* Quick Preset Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '+2 Jam', token: '+2' },
                { label: '+4 Jam', token: '+4' },
                { label: '+6 Jam', token: '+6' },
                { label: '× 4 Minggu', token: '×4' },
                { label: '× 5 Minggu', token: '×5' },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => appendToken(chip.token)}
                  className="touch-target flex-1 rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Keypad Grid (All buttons >= 48x48px touch target) */}
            <div className="grid grid-cols-4 gap-2">
              {['7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="touch-target rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 hover:bg-slate-100"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="touch-target flex items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100"
                title="Bersihkan (Clear)"
              >
                <RotateCcw className="h-4 w-4 mr-1" /> C
              </button>

              {['4', '5', '6'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="touch-target rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 hover:bg-slate-100"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendToken('+')}
                className="touch-target rounded-xl bg-indigo-50 text-lg font-bold text-indigo-700 hover:bg-indigo-100"
              >
                +
              </button>

              {['1', '2', '3'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="touch-target rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 hover:bg-slate-100"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendToken('-')}
                className="touch-target rounded-xl bg-indigo-50 text-lg font-bold text-indigo-700 hover:bg-indigo-100"
              >
                −
              </button>

              <button
                type="button"
                onClick={() => appendToken('0')}
                className="touch-target rounded-xl border border-slate-200 bg-slate-50 text-base font-bold text-slate-900 hover:bg-slate-100"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => appendToken('×')}
                className="touch-target rounded-xl bg-indigo-50 text-lg font-bold text-indigo-700 hover:bg-indigo-100"
              >
                ×
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Hapus karakter terakhir"
                className="touch-target flex items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <Delete className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleEvaluateToNumber}
                className="touch-target rounded-xl bg-amber-500 text-lg font-bold text-white hover:bg-amber-600"
                title="Hitung Hasil (=)"
              >
                =
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: WEEKLY SCHEDULE FORMULA */}
        {mode === 'weekly' && (
          <div className="mt-4 space-y-3">
            <div className="fluid-container gap-3">
              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-slate-700">
                  JTM per Minggu (Jam)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={weeklyJtm}
                  onChange={(e) => setWeeklyJtm(Math.max(0, Number(e.target.value || 0)))}
                  className="touch-target mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-slate-700">
                  Minggu Efektif Bulan Ini
                </label>
                <select
                  value={effectiveWeeks}
                  onChange={(e) => setEffectiveWeeks(Number(e.target.value))}
                  className="touch-target mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900"
                >
                  {[1, 2, 3, 4, 5].map((w) => (
                    <option key={w} value={w}>
                      {w} Minggu
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="fluid-container gap-3">
              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-emerald-700">
                  + Jam Tambahan / Pengganti
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={extraHours}
                  onChange={(e) => setExtraHours(Math.max(0, Number(e.target.value || 0)))}
                  className="touch-target mt-1 w-full rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2 text-sm font-semibold text-emerald-900"
                />
              </div>

              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-rose-700">
                  − Potongan Jam Kosong / Alpa
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={deductedHours}
                  onChange={(e) => setDeductedHours(Math.max(0, Number(e.target.value || 0)))}
                  className="touch-target mt-1 w-full rounded-xl border border-rose-300 bg-rose-50/40 px-3 py-2 text-sm font-semibold text-rose-900"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="fluid-container mt-5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="fluid-item-xs touch-target rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="fluid-item-xs touch-target flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <Check className="h-4 w-4" />
            <span>Gunakan {formatRibuan(finalJtm)} Jam</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default JtmCalculatorModal;
