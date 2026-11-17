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
  doc.setLineWidth(0.32);
  doc.line(startX, y + 0.9, startX + width, y + 0.9);
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
 * Generates and downloads a formal Digital Salary Slip PDF (`Courier Prime`, two-column classic layout)
 * matching the reference layout while supporting PTK Payroll & Partial/Full Disbursement slips.
 */
export async function downloadPayslipPdf(slipRecord, customProfileOverride = null) {
  const profile = customProfileOverride || getSchoolProfile();

  let details = {};
  try {
    details =
      typeof slipRecord.details_json === 'string'
        ? JSON.parse(slipRecord.details_json)
        : slipRecord.details_json || {};
  } catch {
    details = {};
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fontFamily = await registerCourierPrimeFont(doc);
  doc.setFont(fontFamily, 'normal');

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
  const monthName = getMonthName(rawMonth);
  const periodeLine = buildPeriodeRangeLabel(rawMonth, year);

  const baseSalary = Number(details.base_salary || 0);
  const totalJtm = Number(details.total_jtm || 0);
  const hourlyRate = Number(details.hourly_rate || 0);
  const jtmHonor = Number(details.jtm_honor ?? totalJtm * hourlyRate);
  const positionAllowance = Number(details.position_allowance || 0);
  const infaqZakatDeduction = resolveInfaqZakatAmount(details);
  const customSummary = summarizeCustomComponents(details.custom_components);

  const grossSalary = Number(
    details.gross_salary ??
      baseSalary + jtmHonor + positionAllowance + customSummary.totalCustomAllowance
  );
  const totalDeductions = infaqZakatDeduction + customSummary.totalCustomDeduction;
  const estimatedNetSalary = Math.max(
    0,
    Number(details.estimated_net_salary ?? details.net_salary ?? grossSalary - totalDeductions)
  );

  const isDisbursementSlip =
    slipRecord.slip_type === 'disbursement' || details.slip_type === 'disbursement';
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
    : Number(slipRecord.net_salary ?? estimatedNetSalary);

  // Page & Frame Coordinates (matches classic boxed payslip format)
  const frameX = 12;
  const frameY = 12;
  const frameW = 186;
  const centerX = 105;
  const contentLeft = 18;
  const contentRight = 192;

  let y = 20;
  doc.setTextColor(15, 23, 42);

  // Header: Institution Name & Address + Contact
  const institutionTitle =
    [profile.foundation_name, profile.school_name].filter(Boolean).join(' — ') ||
    'YAYASAN PENDIDIKAN NUSANTARA';
  const addressContactLine = [
    profile.address || '',
    profile.contact_info ? `Telepon ${profile.contact_info}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(11.5);
  const wrappedOrg = doc.splitTextToSize(institutionTitle, 174);
  wrappedOrg.forEach((line) => {
    doc.text(line, centerX, y, { align: 'center' });
    y += 4.8;
  });

  if (addressContactLine) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9.5);
    const wrappedAddr = doc.splitTextToSize(addressContactLine, 174);
    wrappedAddr.forEach((line) => {
      doc.text(line, centerX, y, { align: 'center' });
      y += 4.2;
    });
  }

  // Full-width dashed separator line
  y += 1.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([1.6, 1.1], 0);
  doc.line(frameX + 2, y, frameX + frameW - 2, y);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.28);

  // Title (Bold + Underlined) & Period
  y += 6;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10.5);
  const mainTitle = isDisbursementSlip
    ? `SLIP GAJI PENCAIRAN PTK (${disbursementScopeLabel})`
    : slipRecord.payroll_status === 'draft'
    ? 'ESTIMASI SLIP GAJI PTK (DRAF)'
    : slipRecord.payroll_status === 'submitted'
    ? 'ESTIMASI SLIP GAJI PTK (MENUNGGU KEPSEK)'
    : 'SLIP GAJI PTK';
  drawUnderlinedText(doc, mainTitle, centerX, y, { align: 'center' });

  y += 4.8;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.text(periodeLine, centerX, y, { align: 'center' });

  // Identity Block (Left Aligned, Courier Prime colon alignment)
  y += 8.5;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  const identityRows = [
    ['NIP/NIY', nip],
    ['Nama', teacherName],
    ['Kategori', `${categoryLabel} (${bankAccount})`],
    ['Status', status],
    [
      'Kehadiran',
      `${formatAttendanceNumber(details.present_days || 0)} Hadir / ${formatAttendanceNumber(
        details.absent_days || 0
      )} Alpa (${formatAttendanceNumber(totalJtm)} JTM)`,
    ],
  ];
  if (isDisbursementSlip) {
    identityRows.push([
      'Pencairan',
      `${disbursementScopeLabel} - ${disbursementTimingLabel}`,
    ]);
  }

  identityRows.forEach(([label, val]) => {
    doc.text(label, contentLeft, y);
    doc.text(`: ${val}`, contentLeft + 21, y);
    y += 4.6;
  });

  // Two-Column Section: Penghasilan (Left) & Potongan (Right)
  y += 5;
  const colLeftX = contentLeft;
  const colLeftEqX = 60;
  const colLeftAmtX = 99;

  const colRightX = 109;
  const colRightEqX = 151;
  const colRightAmtX = contentRight;

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  drawUnderlinedText(doc, 'Penghasilan', colLeftX, y);
  drawUnderlinedText(doc, 'Potongan', colRightX, y);

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
  ];

  const startItemsY = y + 5.2;
  const rowStep = 4.8;
  doc.setFontSize(9.5);

  let leftY = startItemsY;
  earningsRows.forEach((row) => {
    doc.setFont(fontFamily, 'bold');
    doc.text(String(row.label).slice(0, 20), colLeftX, leftY);
    doc.text('=', colLeftEqX, leftY);
    doc.setFont(fontFamily, 'normal');
    doc.text(formatAmountCell(row.amount), colLeftAmtX, leftY, { align: 'right' });
    leftY += rowStep;
  });

  let rightY = startItemsY;
  deductionRows.forEach((row) => {
    doc.setFont(fontFamily, 'normal');
    doc.text(String(row.label).slice(0, 20), colRightX, rightY);
    doc.text('=', colRightEqX, rightY);
    doc.text(formatAmountCell(row.amount), colRightAmtX, rightY, { align: 'right' });
    rightY += rowStep;
  });

  // Align Total (A) and Total (B) on the exact same baseline
  const totalRowY = Math.max(leftY, rightY) + 0.5;
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(9.5);
  doc.text('Total (A)', colLeftEqX - 3, totalRowY);
  doc.text(formatAmountCell(grossSalary), colLeftAmtX, totalRowY, { align: 'right' });

  doc.text('Total (B)', colRightEqX - 3, totalRowY);
  doc.text(formatAmountCell(totalDeductions), colRightAmtX, totalRowY, { align: 'right' });

  // Double-Row Bordered Box: Penerimaan Bersih (A-B) & Terbilang
  y = totalRowY + 6.5;
  const boxX = contentLeft;
  const boxW = contentRight - contentLeft;
  const row1H = isDisbursementSlip ? 11.2 : 6.8;
  const row2H = 7.2;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.32);
  doc.rect(boxX, y, boxW, row1H);
  doc.rect(boxX, y + row1H, boxW, row2H);

  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  if (isDisbursementSlip) {
    doc.text(
      `Penerimaan Bersih (A-B) = ${formatRupiah(estimatedNetSalary)}`,
      centerX,
      y + 4.4,
      { align: 'center' }
    );
    doc.setFontSize(9.5);
    const disbText =
      remainingEstimatedSalary > 0
        ? `Dicairkan Disetujui = ${formatRupiah(approvedDisbursementAmount)} (Sisa: ${formatRupiah(
            remainingEstimatedSalary
          )})`
        : `Dicairkan Disetujui = ${formatRupiah(approvedDisbursementAmount)}`;
    doc.text(disbText, centerX, y + 9.2, { align: 'center' });
  } else {
    doc.text(
      `Penerimaan Bersih (A-B) = ${formatRupiah(finalTakeHomePay)}`,
      centerX,
      y + 4.7,
      { align: 'center' }
    );
  }

  // Terbilang Row (Italic, Centered)
  doc.setFont(fontFamily, 'italic');
  doc.setFontSize(9.2);
  const terbilangText = `Terbilang: ${numberToTerbilang(finalTakeHomePay)} rupiah`;
  const wrappedTerbilang = doc.splitTextToSize(terbilangText, boxW - 6);
  doc.text(wrappedTerbilang[0], centerX, y + row1H + 4.8, { align: 'center' });

  // Signatories Section
  y = y + row1H + row2H + 9;
  const formattedDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const cityName = profile.city || 'Bandung';

  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);

  // Left Signatory: Kepala Sekolah
  doc.text('Mengetahui,', contentLeft + 2, y);
  doc.text('Kepala Sekolah', contentLeft + 2, y + 4.5);
  doc.setFont(fontFamily, 'bold');
  doc.text(profile.principal_name || 'Kepala Sekolah', contentLeft + 2, y + 20);
  if (profile.principal_nip) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.text(`NIP/NIY: ${profile.principal_nip}`, contentLeft + 2, y + 24);
  }

  // Right Signatory: Bendahara (matching reference layout right block)
  const rightSignX = 128;
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(9.5);
  doc.text(`${cityName}, ${formattedDate}`, rightSignX, y);
  doc.text('Bendahara Sekolah / Yayasan', rightSignX, y + 4.5);
  doc.setFont(fontFamily, 'bold');
  doc.text(profile.treasurer_name || 'Bendahara', rightSignX, y + 20);
  if (profile.treasurer_nip) {
    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8.5);
    doc.text(`NIP/NIY: ${profile.treasurer_nip}`, rightSignX, y + 24);
  }

  const bottomY = y + (profile.principal_nip || profile.treasurer_nip ? 29 : 25);

  // Outer Frame around entire Payslip matching reference screenshot
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);
  doc.rect(frameX, frameY, frameW, Math.max(125, bottomY - frameY));

  const safeNip = String(nip).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePrefix = isDisbursementSlip ? 'Slip_Pencairan' : 'Slip_Gaji';
  doc.save(`${filePrefix}_${safeNip}_${monthName}_${year}.pdf`);
}
