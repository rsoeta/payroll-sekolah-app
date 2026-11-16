import React, { useState, useEffect } from 'react';
import { Calculator, X, Check, Delete, RotateCcw, CalendarRange, Hash } from 'lucide-react';
import { formatRupiah, formatRibuan } from '../utils/formatters';

/**
 * Safe Mathematical Expression Evaluator (Zero `eval()` / `Function()`).
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

export function JtmCalculatorModal({
  isOpen,
  teacher,
  initialJtm = 0,
  onApply,
  onClose,
}) {
  const [mode, setMode] = useState('keypad');
  const [expression, setExpression] = useState(String(initialJtm || ''));

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

  const handleBackspace = () => setExpression((prev) => prev.slice(0, -1));
  const handleClear = () => setExpression('');
  const handleEvaluateToNumber = () => setExpression(String(calculatedKeypadJtm));

  const handleConfirm = () => {
    onApply(finalJtm);
    onClose();
  };

  return (
    <div
      className="nim-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jtm-calc-title"
    >
      <div className="nim-panel nim-modal w-full max-w-md p-5 my-auto">
        {/* Header */}
        <div
          className="flex items-start justify-between gap-2 pb-3"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="nim-kpi__ico">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h3 id="jtm-calc-title" className="text-base font-bold text-[var(--ink)]">
                Kalkulator Total JTM
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {teacher.name} • {formatRupiah(hourlyRate)}/JTM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kalkulator"
            className="nim-ibtn"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex flex-wrap items-center mt-3 gap-2">
          <button
            type="button"
            onClick={() => setMode('keypad')}
            className={`nim-btn nim-btn--sm flex-1 ${mode === 'keypad' ? 'nim-btn--primary' : ''}`}
          >
            <Hash className="h-3.5 w-3.5" />
            <span>Kalkulator Angka</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('weekly')}
            className={`nim-btn nim-btn--sm flex-1 ${mode === 'weekly' ? 'nim-btn--primary' : ''}`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span>Rumus Mingguan</span>
          </button>
        </div>

        {/* Live Result Display Screen */}
        <div
          className="mt-4 rounded-2xl p-4"
          style={{
            background:
              'radial-gradient(circle at top right, var(--accent-soft), transparent 65%), var(--card-2)',
            boxShadow: 'inset 0 0 0 1px var(--accent-glow)',
          }}
        >
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>
              {mode === 'keypad'
                ? 'Ekspresi (Ketik atau gunakan tombol):'
                : `(${weeklyJtm} JTM × ${effectiveWeeks} mgg) + ${extraHours} - ${deductedHours}`}
            </span>
            <span className="font-bold text-[var(--good-text)]">Maks 200 Jam</span>
          </div>

          {mode === 'keypad' && (
            <input
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="Contoh: 6 + 6 + 4 + 8 atau 6 * 4"
              aria-label="Ekspresi perhitungan JTM"
              className="nim-input mt-2 text-right text-lg font-mono font-bold"
            />
          )}

          <div
            className="mt-3 flex items-baseline justify-between pt-2.5"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            <div>
              <span className="nim-kpi__label block">Estimasi Honor JTM</span>
              <span className="text-sm font-bold text-[var(--good-text)] tabular-nums">
                {formatRupiah(estimatedHonor)}
              </span>
            </div>
            <div className="text-right">
              <span className="nim-kpi__label block">Hasil Total JTM</span>
              <span className="text-2xl font-extrabold text-[var(--ink)] tabular-nums">
                {formatRibuan(finalJtm)}{' '}
                <span className="text-xs font-normal text-[var(--muted)]">Jam</span>
              </span>
            </div>
          </div>
        </div>

        {/* MODE 1: KEYPAD CALCULATOR */}
        {mode === 'keypad' && (
          <div className="mt-3 space-y-2.5">
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
                  className="nim-btn nim-btn--sm"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--accent-text)',
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {['7', '8', '9'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="nim-btn py-2 text-sm font-bold"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="nim-btn nim-btn--danger py-2 text-xs font-bold"
                title="Bersihkan (Clear)"
              >
                <RotateCcw className="h-3.5 w-3.5" /> C
              </button>

              {['4', '5', '6'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="nim-btn py-2 text-sm font-bold"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendToken('+')}
                className="nim-btn py-2 text-base font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                +
              </button>

              {['1', '2', '3'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendToken(n)}
                  className="nim-btn py-2 text-sm font-bold"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendToken('-')}
                className="nim-btn py-2 text-base font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                −
              </button>

              <button
                type="button"
                onClick={() => appendToken('0')}
                className="nim-btn py-2 text-sm font-bold"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => appendToken('×')}
                className="nim-btn py-2 text-base font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              >
                ×
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Hapus karakter terakhir"
                className="nim-btn py-2 text-sm"
              >
                <Delete className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleEvaluateToNumber}
                className="nim-btn nim-btn--warn py-2 text-base font-bold"
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
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
                  JTM per Minggu (Jam)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={weeklyJtm}
                  onChange={(e) => setWeeklyJtm(Math.max(0, Number(e.target.value || 0)))}
                  className="nim-input mt-1 font-bold"
                />
              </div>

              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-[var(--ink-2)]">
                  Minggu Efektif Bulan Ini
                </label>
                <select
                  value={effectiveWeeks}
                  onChange={(e) => setEffectiveWeeks(Number(e.target.value))}
                  className="nim-select mt-1 font-bold"
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
                <label className="block text-xs font-semibold text-[var(--good-text)]">
                  + Jam Tambahan / Pengganti
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={extraHours}
                  onChange={(e) => setExtraHours(Math.max(0, Number(e.target.value || 0)))}
                  className="nim-input mt-1 font-semibold"
                />
              </div>

              <div className="fluid-item-xs">
                <label className="block text-xs font-semibold text-[var(--bad-text)]">
                  − Potongan Jam Kosong / Alpa
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={deductedHours}
                  onChange={(e) => setDeductedHours(Math.max(0, Number(e.target.value || 0)))}
                  className="nim-input mt-1 font-semibold"
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div
          className="flex flex-wrap items-center justify-end mt-5 pt-3 gap-2"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="nim-btn"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="nim-btn nim-btn--primary"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Gunakan {formatRibuan(finalJtm)} Jam</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default JtmCalculatorModal;
