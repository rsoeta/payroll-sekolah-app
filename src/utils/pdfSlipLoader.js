export async function downloadPayslipPdf(...args) {
  const mod = await import('./pdfSlipGenerator');
  return mod.downloadPayslipPdf(...args);
}

export async function downloadBatchPayslipsPdf(...args) {
  const mod = await import('./pdfSlipGenerator');
  return mod.downloadBatchPayslipsPdf(...args);
}
