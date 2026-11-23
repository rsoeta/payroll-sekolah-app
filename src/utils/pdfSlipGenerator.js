import { jsPDF } from 'jspdf';
import {
  formatRibuan,
  formatRupiah,
  getMonthName,
  getSingleMonthName,
  getStaffCategoryLabel,
  numberToTerbilang,
  parsePeriodMonthKey,
  resolveInfaqZakatAmount,
  summarizeCustomComponents,
} from './formatters';
import { formatAttendanceNumber } from './attendanceHelpers';
import { getSchoolProfile } from '../services/schoolProfileService';

import courierPrimeRegularUrl from '../assets/fonts/CourierPrime-Regular.ttf?url';
import courierPrimeBoldUrl from '../assets/fonts/CourierPrime-Bold.ttf?url';
import courierPrimeItalicUrl from '../assets/fonts/CourierPrime-Italic.ttf?url';
import courierPrimeBoldItalicUrl from '../assets/fonts/CourierPrime-BoldItalic.ttf?url';

let cachedCourierPrimeFonts = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + step)));
  }
  return btoa(chunks.join(''));
}

async function fetchFontBase64(assetUrl) {
  const res = await fetch(assetUrl);
  if (!res.ok) throw new Error(`Gagal memuat font: ${assetUrl}`);
  const buf = await res.arrayBuffer();
  return arrayBufferToBase64(buf);
}

/**
 * Loads & registers Courier Prime (Regular, Bold, Italic, BoldItalic) into jsPDF VFS.
 * Falls back cleanly to built-in 'courier' if offline asset fetch fails.
 */
async function registerCourierPrimeFont(doc) {
  try {
    if (!cachedCourierPrimeFonts) {
      const [regular, bold, italic, boldItalic] = await Promise.all([
        fetchFontBase64(courierPrimeRegularUrl),
        fetchFontBase64(courierPrimeBoldUrl),
        fetchFontBase64(courierPrimeItalicUrl),
        fetchFontBase64(courierPrimeBoldItalicUrl),
      ]);
      cachedCourierPrimeFonts = { regular, bold, italic, boldItalic };
    }

    doc.addFileToVFS('CourierPrime-Regular.ttf', cachedCourierPrimeFonts.regular);
    doc.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');

    doc.addFileToVFS('CourierPrime-Bold.ttf', cachedCourierPrimeFonts.bold);
    doc.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold');

    doc.addFileToVFS('CourierPrime-Italic.ttf', cachedCourierPrimeFonts.italic);
    doc.addFont('CourierPrime-Italic.ttf', 'CourierPrime', 'italic');

    doc.addFileToVFS('CourierPrime-BoldItalic.ttf', cachedCourierPrimeFonts.boldItalic);
    doc.addFont('CourierPrime-BoldItalic.ttf', 'CourierPrime', 'bolditalic');

    return 'CourierPrime';
  } catch {
    return 'courier';
  }
}

function drawUnderlinedText(doc, text, x, y, options = {}) {
  doc.text(text, x, y, options);
  const width = doc.getTextWidth(text);
  let startX = x;
  if (options.align === 'center') {
    startX = x - width / 2;
  } else if (options.align === 'right') {
    startX = x - width;
  }
  const prevLineWidth = doc.getLineWidth();
  doc.setLineWidth(0.28);
  doc.line(startX, y + 0.8, startX + width, y + 0.8);
  doc.setLineWidth(prevLineWidth);
}

function buildPeriodeRangeLabel(monthValue, yearValue) {
  const parsed = parsePeriodMonthKey(monthValue);
  const yr = Number(yearValue) || new Date().getFullYear();
  const startName = getSingleMonthName(parsed.startMonth);
  const endName = getSingleMonthName(parsed.endMonth);
  const lastDay = new Date(yr, parsed.endMonth, 0).getDate();
  return `Periode 1 ${startName} ${yr} - ${lastDay} ${endName} ${yr}`;
}

function formatAmountCell(value) {
  const num = Math.round(Number(value || 0));
  return num > 0 ? formatRibuan(num) : '-';
}

/**
 * Draws (or measures with `dryRun: true`) a single compact classic Courier Prime payslip starting at `slotTopY` (mm).
 * Engineered to consume <= 140 mm vertically so 2 slips cleanly sit centered in each half of 1 A4 sheet (297 mm).
 */
function drawCompactPayslipSlot(
  doc,
  slipRecord,
  profile,
  fontFamily,
  slotTopY = 5,
  { dryRun = false } = {}
) {
  let details = {};
  try {
    details =
      typeof slipRecord.details_json === 'string'
        ? JSON.parse(slipRecord.details_json)
        : slipRecord.details_json || {};
  } catch {
    details = {};
  }

  const teacherName = String(details.teacher_name || slipRecord.teacher_name || '-');
  const nip = String(details.nip || slipRecord.nip || '-');
  const status = String(details.status || 'GTY');
  const categoryLabel = getStaffCategoryLabel({
    staff_category: details.staff_category || slipRecord.staff_category,
    status,
  });
  const bankAccount = String(details.bank_account || slipRecord.bank_account || '-');
  const rawMonth = details.month || slipRecord.month;
  const year = Number(details.year || slipRecord.year || new Date().getFullYear());
  const periodeLine = buildPeriodeRangeLabel(rawMonth, year);

  const baseSalary = Number(details.base_salary || 0);
  const totalJtm = Number(details.total_jtm || 0);
  const hourlyRate = Number(details.hourly_rate || 0);
  const jtmHonor = Number(details.jtm_honor ?? totalJtm * hourlyRate);
  const positionAllowance = Number(details.position_allowance || 0);
  const infaqZakatDeduction = resolveInfaqZakatAmount(details);
  const customSummary = summarizeCustomComponents(details.custom_components);

  const isDisbursementSlip =
    slipRecord.slip_type === 'disbursement' || details.slip_type === 'disbursement';

  const grossSalary = Number(
    details.gross_salary ??
      baseSalary + jtmHonor + positionAllowance + customSummary.totalCustomAllowance
  );
  const regularDeductions = infaqZakatDeduction + customSummary.totalCustomDeduction;
  const approvedDisbursementTotal = !isDisbursementSlip
    ? Math.max(0, Number(details.approved_disbursement_total || 0))
    : 0;
  const approvedDisbursementCount = !isDisbursementSlip
    ? Number(details.approved_disbursement_count || 0)
    : 0;
  const totalDeductions = regularDeductions + approvedDisbursementTotal;
  const estimatedNetSalary = isDisbursementSlip
    ? Math.max(
        0,
        Number(
          details.estimated_net_salary ??
            details.net_salary_before_disbursement ??
            grossSalary - regularDeductions
        )
      )
    : Math.max(0, Number(details.net_salary ?? grossSalary - totalDeductions));

  const disbursementScopeLabel =
    (details.request_scope || slipRecord.request_scope) === 'partial'
      ? 'SEBAGIAN'
      : 'SELURUHNYA';
  const disbursementTimingLabel =
    (details.disbursement_timing || slipRecord.disbursement_timing) === 'early'
      ? 'SEBELUM WAKTUNYA'
      : 'TEPAT WAKTU';
  const approvedDisbursementAmount = Number(
    details.approved_amount ?? slipRecord.approved_amount ?? slipRecord.net_salary ?? estimatedNetSalary
  );
  const remainingEstimatedSalary = Math.max(
    0,
    Number(details.remaining_estimated_salary ?? estimatedNetSalary - approvedDisbursementAmount)
  );
  const finalTakeHomePay = isDisbursementSlip
    ? approvedDisbursementAmount
    : Math.max(0, Number(slipRecord.net_salary ?? estimatedNetSalary));

  const frameX = 10;
  const frameW = 190;
  const centerX = 105;
  const contentLeft = 16;
  const contentRight = 194;

  const earningsRows = [
    { label: 'Gaji Pokok', amount: baseSalary },
    {
      label: `Honor JTM (${formatAttendanceNumber(totalJtm)}j)`,
      amount: jtmHonor,
    },
    { label: 'Tj. Jabatan', amount: positionAllowance },
    ...customSummary.allowances.map((item) => ({
      label: item.label,
      amount: item.amount,
    })),
  ];

  const deductionRows = [
    { label: 'Infaq/Zakat 2,5%', amount: infaqZakatDeduction },
    ...customSummary.deductions.map((item) => ({
      label: item.label,
      amount: item.amount,
    })),
    ...(approvedDisbursementTotal > 0
      ? [
          {
            label:
              approvedDisbursementCount > 1
                ? `Pencairan (${approvedDisbursementCount}x)`
                : 'Pencairan Disetujui',
            amount: approvedDisbursementTotal,
          },
        ]
      : []),
  ];

  const maxDataRows = Math.max(earningsRows.length, deductionRows.length);
  const isDense = maxDataRows > 5;
  const rowStep = isDense ? 3.5 : 4.0;

  let y = slotTopY + 6.5;
  if (!dryRun) doc.setTextColor(15, 23, 42);

  // Header: Institution Name & Address + Contact (Compact top margin)
  const institutionTitle =
    [profile.foundation_name, profile.school_name].filter(Boolean).join(' - ') ||
    'YAYASAN PENDIDIKAN NUSANTARA';
  const addressContactLine = [
    profile.address || '',
    profile.contact_info ? `Telp. ${profile.contact_info}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  const wrappedOrg = doc.splitTextToSize(institutionTitle, 178).slice(0, 2);
  wrappedOrg.forEach((line) => {
    if (!dryRun) doc.text(line, centerX, y, { align: 'center' });
    y += 4.1;
  });

  if (addressContactLine) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    const wrappedAddr = doc.splitTextToSize(addressContactLine, 178).slice(0, 2);
    wrappedAddr.forEach((line) => {
      if (!dryRun) doc.text(line, centerX, y, { align: 'center' });
      y += 3.5;
    });
  }

  // Full-width dashed separator line
  y += 0.8;
  if (!dryRun) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.45);
    doc.setLineDashPattern([1.5, 1.0], 0);
    doc.line(frameX + 2, y, frameX + frameW - 2, y);
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.28);
  }

  // Title (Bold + Underlined) & Period
  y += 4.6;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.8);
  const mainTitle = isDisbursementSlip
    ? `SLIP GAJI PENCAIRAN PTK (${disbursementScopeLabel})`
    : slipRecord.payroll_status === 'draft'
    ? 'ESTIMASI SLIP GAJI PTK (DRAF)'
    : slipRecord.payroll_status === 'submitted'
    ? 'ESTIMASI SLIP GAJI PTK (MENUNGGU KEPSEK)'
    : 'SLIP GAJI PTK';
  if (!dryRun) drawUnderlinedText(doc, mainTitle, centerX, y, { align: 'center' });

  y += 4.1;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.2);
  if (!dryRun) doc.text(periodeLine, centerX, y, { align: 'center' });

  // Compact 2-Column Identity Block (strictly 4 lines tall so slip fits 2 per A4 sheet)
  y += 5.8;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(8.8);
  const idRowStep = 3.8;
  const leftIdRows = [
    ['NIP/NIY', nip.slice(0, 28)],
    ['Nama', teacherName.slice(0, 28)],
    ['Kategori', categoryLabel.slice(0, 28)],
    ['Status', status.slice(0, 28)],
  ];
  const rightIdRows = [
    ['Rekening', bankAccount.slice(0, 24)],
    [
      'Kehadiran',
      `${formatAttendanceNumber(details.present_days || 0)} Hr / ${formatAttendanceNumber(
        details.absent_days || 0
      )} Alpa`,
    ],
    ['Total JTM', `${formatAttendanceNumber(totalJtm)} Jam Pelajaran`],
    ...(isDisbursementSlip
      ? [['Pencairan', `${disbursementScopeLabel} (${disbursementTimingLabel})`.slice(0, 26)]]
      : []),
  ];

  const rightIdX = 112;
  for (let i = 0; i < 4; i++) {
    const ry = y + i * idRowStep;
    if (!dryRun) {
      const [lLbl, lVal] = leftIdRows[i];
      doc.text(lLbl, contentLeft, ry);
      doc.text(`: ${lVal}`, contentLeft + 18, ry);
      if (rightIdRows[i]) {
        const [rLbl, rVal] = rightIdRows[i];
        doc.text(rLbl, rightIdX, ry);
        doc.text(`: ${rVal}`, rightIdX + 20, ry);
      }
    }
  }
  y += 4 * idRowStep;

  // Two-Column Section: Penghasilan (Left) & Potongan (Right)
  y += 2.6;
  const colLeftX = contentLeft;
  const colLeftEqX = 59;
  const colLeftAmtX = 99;

  const colRightX = 109;
  const colRightEqX = 152;
  const colRightAmtX = contentRight;

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.2);
  if (!dryRun) {
    drawUnderlinedText(doc, 'Penghasilan', colLeftX, y);
    drawUnderlinedText(doc, 'Potongan', colRightX, y);
  }

  const startItemsY = y + 4.4;
  doc.setFontSize(8.8);

  let leftY = startItemsY;
  earningsRows.forEach((row) => {
    if (!dryRun) {
      doc.setFont(fontFamily, 'bold');
      doc.text(String(row.label).slice(0, 21), colLeftX, leftY);
      doc.text('=', colLeftEqX, leftY);
      doc.setFont(fontFamily, 'normal');
      doc.text(formatAmountCell(row.amount), colLeftAmtX, leftY, { align: 'right' });
    }
    leftY += rowStep;
  });

  let rightY = startItemsY;
  deductionRows.forEach((row) => {
    if (!dryRun) {
      doc.setFont(fontFamily, 'normal');
      doc.text(String(row.label).slice(0, 21), colRightX, rightY);
      doc.text('=', colRightEqX, rightY);
      doc.text(formatAmountCell(row.amount), colRightAmtX, rightY, { align: 'right' });
    }
    rightY += rowStep;
  });

  // Align Total (A) and Total (B) on the exact same baseline
  const totalRowY = Math.max(leftY, rightY) + 0.4;
  if (!dryRun) {
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9);
    doc.text('Total (A)', colLeftEqX - 3, totalRowY);
    doc.text(formatAmountCell(grossSalary), colLeftAmtX, totalRowY, { align: 'right' });

    doc.text('Total (B)', colRightEqX - 3, totalRowY);
    doc.text(formatAmountCell(totalDeductions), colRightAmtX, totalRowY, { align: 'right' });
  }

  // Double-Row Bordered Box: Penerimaan Bersih (A-B) & Terbilang
  y = totalRowY + 3.8;
  const boxX = contentLeft;
  const boxW = contentRight - contentLeft;
  const row1H = isDisbursementSlip ? 9.6 : 6.0;
  const row2H = 6.2;

  if (!dryRun) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.3);
    doc.rect(boxX, y, boxW, row1H);
    doc.rect(boxX, y + row1H, boxW, row2H);

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(9.5);
    if (isDisbursementSlip) {
      doc.text(
        `Penerimaan Bersih (A-B) = ${formatRupiah(estimatedNetSalary)}`,
        centerX,
        y + 3.9,
        { align: 'center' }
      );
      doc.setFontSize(8.8);
      const disbText =
        remainingEstimatedSalary > 0
          ? `Dicairkan Disetujui = ${formatRupiah(approvedDisbursementAmount)} (Sisa: ${formatRupiah(
              remainingEstimatedSalary
            )})`
          : `Dicairkan Disetujui = ${formatRupiah(approvedDisbursementAmount)}`;
      doc.text(disbText, centerX, y + 8.0, { align: 'center' });
    } else {
      const netPrefix =
        approvedDisbursementTotal > 0 ? 'Sisa Penerimaan (A-B)' : 'Penerimaan Bersih (A-B)';
      doc.text(`${netPrefix} = ${formatRupiah(finalTakeHomePay)}`, centerX, y + 4.2, {
        align: 'center',
      });
    }

    // Terbilang Row (Italic, Centered)
    doc.setFont(fontFamily, 'italic');
    doc.setFontSize(8.6);
    const terbilangText = `Terbilang: ${numberToTerbilang(finalTakeHomePay)} rupiah`;
    const wrappedTerbilang = doc.splitTextToSize(terbilangText, boxW - 6);
    doc.text(wrappedTerbilang[0], centerX, y + row1H + 4.3, { align: 'center' });
  }

  // Compact Signatories Block
  y = y + row1H + row2H + 5.2;
  const formattedDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const cityName = profile.city || 'Bandung';
  const signDrop = isDense ? 12.5 : 14.5;

  if (!dryRun) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.8);

    // Left Signatory: Kepala Sekolah
    doc.text('Mengetahui,', contentLeft + 2, y);
    doc.text('Kepala Sekolah', contentLeft + 2, y + 3.8);
    doc.setFont(fontFamily, 'bold');
    doc.text(profile.principal_name || 'Kepala Sekolah', contentLeft + 2, y + signDrop);
    if (profile.principal_nip) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8);
      doc.text(`NIP/NIY: ${profile.principal_nip}`, contentLeft + 2, y + signDrop + 3.5);
    }

    // Right Signatory: Bendahara (matching reference layout right block)
    const rightSignX = 128;
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.8);
    doc.text(`${cityName}, ${formattedDate}`, rightSignX, y);
    doc.text('Bendahara Sekolah / Yayasan', rightSignX, y + 3.8);
    doc.setFont(fontFamily, 'bold');
    doc.text(profile.treasurer_name || 'Bendahara', rightSignX, y + signDrop);
    if (profile.treasurer_nip) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(8);
      doc.text(`NIP/NIY: ${profile.treasurer_nip}`, rightSignX, y + signDrop + 3.5);
    }
  }

  const hasSignNip = Boolean(profile.principal_nip || profile.treasurer_nip);
  const lastBaselineY = y + signDrop + (hasSignNip ? 3.5 : 0);
  const boxHeight = Math.min(141, lastBaselineY + 4.8 - slotTopY);

  if (!dryRun) {
    // Outer Frame around Slip
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.32);
    doc.rect(frameX, slotTopY, frameW, boxHeight);
  }

  return boxHeight;
}

const A4_HALF_HEIGHT_MM = 148.5;

function computeCenteredSlotTop(doc, slipRecord, profile, fontFamily, slotIndex) {
  const measuredHeight = drawCompactPayslipSlot(doc, slipRecord, profile, fontFamily, 0, {
    dryRun: true,
  });
  const baseOffset = slotIndex === 0 ? 0 : A4_HALF_HEIGHT_MM;
  const verticalMargin = Math.max(3.5, (A4_HALF_HEIGHT_MM - measuredHeight) / 2);
  return baseOffset + verticalMargin;
}

/**
 * Generates and downloads a single Salary Slip PDF centered cleanly within the top half of A4.
 */
export async function downloadPayslipPdf(slipRecord, customProfileOverride = null) {
  const profile = customProfileOverride || getSchoolProfile();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const fontFamily = await registerCourierPrimeFont(doc);

  const centeredTopY = computeCenteredSlotTop(doc, slipRecord, profile, fontFamily, 0);
  drawCompactPayslipSlot(doc, slipRecord, profile, fontFamily, centeredTopY);

  let details = {};
  try {
    details =
      typeof slipRecord.details_json === 'string'
        ? JSON.parse(slipRecord.details_json)
        : slipRecord.details_json || {};
  } catch {
    details = {};
  }
  const nip = String(details.nip || slipRecord.nip || '-');
  const rawMonth = details.month || slipRecord.month;
  const monthName = getMonthName(rawMonth);
  const year = Number(details.year || slipRecord.year || new Date().getFullYear());
  const isDisbursementSlip =
    slipRecord.slip_type === 'disbursement' || details.slip_type === 'disbursement';

  const safeNip = nip.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePrefix = isDisbursementSlip ? 'Slip_Pencairan' : 'Slip_Gaji';
  doc.save(`${filePrefix}_${safeNip}_${monthName}_${year}.pdf`);
}

/**
 * Exports multiple salary slips packed cleanly 2 slips per A4 portrait page (top half + bottom half
 * separated by a subtle dashed cut guide line at 148.5mm).
 */
export async function downloadBatchPayslipsPdf(
  slipRecords = [],
  fileLabel = 'Kolektif_PTK',
  customProfileOverride = null
) {
  if (!Array.isArray(slipRecords) || slipRecords.length === 0) return;
  const profile = customProfileOverride || getSchoolProfile();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const fontFamily = await registerCourierPrimeFont(doc);

  slipRecords.forEach((slip, index) => {
    const slotInPage = index % 2;
    if (index > 0 && slotInPage === 0) {
      doc.addPage();
    }

    if (slotInPage === 0) {
      const topSlotY = computeCenteredSlotTop(doc, slip, profile, fontFamily, 0);
      drawCompactPayslipSlot(doc, slip, profile, fontFamily, topSlotY);
    } else {
      // Subtle paper cut guide line at exact half A4 height (148.5mm)
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.25);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(6, A4_HALF_HEIGHT_MM, 204, A4_HALF_HEIGHT_MM);
      doc.setLineDashPattern([], 0);

      const bottomSlotY = computeCenteredSlotTop(doc, slip, profile, fontFamily, 1);
      drawCompactPayslipSlot(doc, slip, profile, fontFamily, bottomSlotY);
    }
  });

  const safeLabel = String(fileLabel || 'Kolektif_PTK').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Slip_Gaji_${safeLabel}_2perA4.pdf`);
}
