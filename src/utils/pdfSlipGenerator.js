import { jsPDF } from 'jspdf';
import {
  formatRupiah,
  getMonthName,
  resolveInfaqZakatAmount,
  summarizeCustomComponents,
} from './formatters';
import { getSchoolProfile } from '../services/schoolProfileService';

let cachedDefaultLogoDataUrl = null;

async function resolveLogoDataUrl(logoSource) {
  const src = String(logoSource || '/logo.png').trim();
  if (src.startsWith('data:image/')) {
    return src;
  }
  if (src === '/logo.png' && cachedDefaultLogoDataUrl) {
    return cachedDefaultLogoDataUrl;
  }
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (src === '/logo.png') {
          cachedDefaultLogoDataUrl = reader.result;
        }
        resolve(reader.result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates and downloads an official Digital Salary Slip PDF (`Slip_Gaji_<NIP>_<Bulan>_<Tahun>.pdf`).
 * Dynamically applies the configured School / Foundation identity (Name, Address, Logo, Signatories, Footer).
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

  const teacherName = details.teacher_name || slipRecord.teacher_name || '-';
  const nip = details.nip || slipRecord.nip || '-';
  const status = details.status || 'GTY';
  const bankAccount = details.bank_account || slipRecord.bank_account || '-';
  const monthName = getMonthName(details.month || slipRecord.month);
  const year = details.year || slipRecord.year || new Date().getFullYear();

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
  const netSalary = Number(
    slipRecord.net_salary ??
      details.net_salary ??
      Math.max(0, grossSalary - infaqZakatDeduction - customSummary.totalCustomDeduction)
  );

  // Header Banner (Matches dark forest green brand palette #19381f)
  doc.setFillColor(25, 56, 31);
  doc.rect(0, 0, 210, 42, 'F');

  const logoDataUrl = await resolveLogoDataUrl(profile.logo_data_url);
  let textStartX = 15;
  if (logoDataUrl) {
    try {
      const imgFormat = logoDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(logoDataUrl, imgFormat, 15, 7, 28, 28);
      textStartX = 48;
    } catch {
      textStartX = 15;
    }
  }

  const foundationHeader = String(profile.foundation_name || 'YAYASAN PENDIDIKAN NUSANTARA').toUpperCase();
  const schoolSubHeader = String(profile.school_name || 'SLIP GAJI RESMI PENDIDIK & TENAGA KEPENDIDIKAN');
  const addressLine = [profile.address, profile.contact_info].filter(Boolean).join(' • ');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(foundationHeader.slice(0, 58), textStartX, 14);

  doc.setFontSize(11);
  doc.setTextColor(220, 252, 231);
  doc.text(schoolSubHeader.slice(0, 68), textStartX, 20.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  if (addressLine) {
    doc.text(addressLine.slice(0, 92), textStartX, 26.5);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  const slipStatusLabel =
    slipRecord.payroll_status === 'draft'
      ? 'ESTIMASI SLIP GAJI (DRAF)'
      : slipRecord.payroll_status === 'submitted'
      ? 'ESTIMASI SLIP GAJI (MENUNGGU KEPSEK)'
      : 'SLIP GAJI RESMI';
  doc.text(
    `${slipStatusLabel}  |  Periode: ${monthName} ${year}  |  Ref: ${String(slipRecord.id || 'DOC').slice(0, 8).toUpperCase()}`,
    textStartX,
    33.5
  );

  // Employee Identity Box
  doc.setTextColor(15, 23, 42);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, 48, 180, 34, 3, 3, 'FD');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Nama Pendidik', 20, 57);
  doc.text('NIP / NIY', 20, 65);
  doc.text('Status Kepegawaian', 20, 73);

  doc.setFont('helvetica', 'normal');
  doc.text(`: ${teacherName}`, 60, 57);
  doc.text(`: ${nip}`, 60, 65);
  doc.text(`: ${status}`, 60, 73);

  doc.setFont('helvetica', 'bold');
  doc.text('Rekening Tujuan', 115, 57);
  doc.text('Kehadiran / Alpa', 115, 65);
  doc.text('Total Jam (JTM)', 115, 73);

  doc.setFont('helvetica', 'normal');
  doc.text(`: ${bankAccount}`, 152, 57);
  doc.text(`: ${details.present_days || 0} Hari / ${details.absent_days || 0} Alpa`, 152, 65);
  doc.text(`: ${totalJtm} Jam Pelajaran`, 152, 73);

  // Earnings Section
  let y = 93;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(25, 56, 31);
  doc.text('A. RINCIAN PENERIMAAN', 15, y);
  y += 4;
  doc.setDrawColor(187, 247, 208);
  doc.line(15, y, 195, y);

  y += 9;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  doc.text('1. Gaji Pokok', 20, y);
  doc.text(formatRupiah(baseSalary), 190, y, { align: 'right' });

  y += 8;
  doc.text(`2. Honor Mengajar (${totalJtm} JTM x ${formatRupiah(hourlyRate)})`, 20, y);
  doc.text(formatRupiah(jtmHonor), 190, y, { align: 'right' });

  y += 8;
  doc.text('3. Tunjangan Jabatan & Fungsional', 20, y);
  doc.text(formatRupiah(positionAllowance), 190, y, { align: 'right' });

  customSummary.allowances.forEach((item, idx) => {
    y += 8;
    doc.text(`${4 + idx}. ${item.label}`, 20, y);
    doc.text(formatRupiah(item.amount), 190, y, { align: 'right' });
  });

  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(20, y, 190, y);

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Total Penerimaan Kotor (Gross)', 20, y);
  doc.text(formatRupiah(grossSalary), 190, y, { align: 'right' });

  // Deductions Section
  y += 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(190, 18, 60);
  doc.text('B. RINCIAN POTONGAN', 15, y);
  y += 4;
  doc.setDrawColor(254, 205, 211);
  doc.line(15, y, 195, y);

  y += 9;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    infaqZakatDeduction > 0
      ? '1. Infaq / Zakat Profesi (2,5%)'
      : '1. Infaq / Zakat Profesi (Tidak Aktif / Opsional)',
    20,
    y
  );
  doc.text(
    infaqZakatDeduction > 0 ? `- ${formatRupiah(infaqZakatDeduction)}` : 'Rp 0',
    190,
    y,
    { align: 'right' }
  );

  customSummary.deductions.forEach((item, idx) => {
    y += 8;
    doc.text(`${2 + idx}. ${item.label}`, 20, y);
    doc.text(`- ${formatRupiah(item.amount)}`, 190, y, { align: 'right' });
  });

  if (customSummary.deductions.length > 0) {
    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.line(20, y, 190, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Total Seluruh Potongan', 20, y);
    doc.text(
      `- ${formatRupiah(infaqZakatDeduction + customSummary.totalCustomDeduction)}`,
      190,
      y,
      { align: 'right' }
    );
  }

  // Net Salary Box
  y += 13;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(22, 163, 74);
  doc.roundedRect(15, y, 180, 19, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(20, 83, 45);
  doc.text('TAKE HOME PAY (GAJI BERSIH DITERIMA)', 22, y + 12);
  doc.setFontSize(13.5);
  doc.text(formatRupiah(netSalary), 188, y + 12, { align: 'right' });

  // Official Signatories Block (Kepala Sekolah & Bendahara)
  y += 28;
  const formattedDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const cityName = profile.city || 'Bandung';

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  // Left: Principal
  doc.text('Mengetahui,', 25, y);
  doc.text('Kepala Sekolah', 25, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.principal_name || 'Kepala Sekolah', 25, y + 24);
  doc.setFont('helvetica', 'normal');
  if (profile.principal_nip) {
    doc.setFontSize(8.5);
    doc.text(`NIP/NIY: ${profile.principal_nip}`, 25, y + 28.5);
  }

  // Right: Treasurer
  doc.setFontSize(9.5);
  doc.text(`${cityName}, ${formattedDate}`, 130, y);
  doc.text('Bendahara Sekolah / Yayasan', 130, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.treasurer_name || 'Bendahara', 130, y + 24);
  doc.setFont('helvetica', 'normal');
  if (profile.treasurer_nip) {
    doc.setFontSize(8.5);
    doc.text(`NIP/NIY: ${profile.treasurer_nip}`, 130, y + 28.5);
  }

  // Verification Footer
  y += 38;
  doc.setDrawColor(226, 232, 240);
  doc.line(15, y - 4, 195, y - 4);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    String(
      profile.slip_footer_note ||
        'Dokumen ini diterbitkan secara resmi dan sah oleh Sistem Penggajian Sekolah / Yayasan.'
    ).slice(0, 105),
    15,
    y
  );

  const safeNip = String(nip).replace(/[^a-zA-Z0-9_-]/g, '');
  doc.save(`Slip_Gaji_${safeNip}_${monthName}_${year}.pdf`);
}
