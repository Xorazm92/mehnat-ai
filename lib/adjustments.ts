// PayrollAdjustment.amount tarixan IKKI xil ishorada saqlangan:
//   - approveEmployeeSalary 'payment' qatorini MUSBAT yozadi;
//   - Oylik jadvalidagi qo'lda kiritish (PayrollTable) avans/jarima/payment'ni
//     MANFIY yuboradi.
// Shu sabab pul o'quvchilari (balans, kassa oqimi, kabinet yig'indilari) summani
// ishoraga qaramay MIQDOR sifatida o'qishi shart — aks holda manfiy avans
// chiqimni KAMAYTIRIB, balansni sun'iy oshiradi. Yozuv konventsiyasini
// o'zgartirish o'rniga (bazadagi eski qatorlar aralash), barcha o'quvchilar shu
// helper orqali normallashtiradi.
export function adjustmentMagnitude(amount: unknown): number {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}
