// Moliyaviy hisobot turlari (server va client uchun umumiy)
export const REPORT_TYPES: Record<string, { label: string; format: string }> = {
  profit_loss: { label: "Foyda va zarar hisoboti", format: "PDF" },
  balance: { label: "Balans hisoboti (F-1)", format: "XLS" },
  qqs: { label: "QQS deklaratsiyasi", format: "PDF" },
  cashflow: { label: "Pul oqimi hisoboti", format: "PDF" },
};
