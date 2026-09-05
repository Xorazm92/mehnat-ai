"use client";

/**
 * OPERATION ROW — matritsaning bitta firma qatori.
 *
 * `React.memo` — qator faqat o'z ma'lumoti o'zgarganda qayta chiziladi.
 * Muzlatilgan (sticky) ustun offsetlari shu yerda qotirilgan piksel; ularni
 * o'lchanadigan qilish M8 ishiga bog'liq (docs/audit/UI_AUDIT_2026-07.md).
 */
import React, { useMemo } from "react";
import { formatNum } from "@/lib/platform/format";
import { type ReportColumn, serviceEnabled } from "@/lib/reportColumns";
import { canEditMatrix } from "@/lib/reportPermissions";
import { columnAppliesToRegime, regimeBlockReason } from "@/lib/reportApplicability";
import type { CompanyRelation } from "@/lib/platform/access";
import { Tooltip } from "@/components/ui/Tooltip";
import { StatusCell } from "./StatusCell";
import { buildGroupEdges, getGroupStyle, paymentCellBg, paymentCellColor } from "./matrixVisuals";
import type { ProofMeta, ReportRow } from "./types";

export const OperationRow = React.memo<{
  row: ReportRow;
  idx: number;
  visibleColumns: ReportColumn[];
  userRole: string;
  relations: CompanyRelation[];
  activeServices: string[];
  payment?: { expected: number; collected: number };
  showPayment: boolean;
  proofMeta: Map<string, ProofMeta>;
  onCellUpdate: (companyId: string, colKey: string, newValue: string) => void;
  onCompanySelect: (companyId: string) => void;
  onRequestSubmit: (companyId: string, colKey: string) => void;
  onViewProof: (companyId: string, colKey: string) => void;
}>(({ row, idx, visibleColumns, userRole, relations, activeServices, payment, showPayment, proofMeta, onCellUpdate, onCompanySelect, onRequestSubmit, onViewProof }) => {
  /**
   * Xizmat yoqilganmi. To'lov yarmi HISOBOT yarmidan meros oladi — uning o'z
   * katakchasi hech qaysi sozlash ekranida yo'q (lib/reportColumns.ts).
   */
  const isServiceEnabled = (key: string, parentKey?: string) =>
    serviceEnabled(activeServices, key, parentKey);
  /**
   * SOLIQ REJIMI bo'yicha yopish.
   *
   * QQS to'lovchi firmada "Aylanma" ustuni, aylanma rejimidagi firmada esa
   * "QQS" ustuni yopiq turadi. Ilgari ikkalasi bitta `aylanma_qqs` katagi edi
   * va kim nimani topshirishi kerakligi matritsadan ko'rinmasdi.
   */
  const regimeOf = String((row as { regime?: string }).regime ?? '');
  const isRegimeEnabled = (key: string) => columnAppliesToRegime(key, regimeOf);
  const proofOf = (colKey: string) => (row.companyId ? proofMeta.get(`${row.companyId}::${colKey}`) : undefined);
  const proofStatusOf = (colKey: string) => proofOf(colKey)?.status;
  const proofMineOf = (colKey: string) => proofOf(colKey)?.mine === true;
  const groupEdges = useMemo(() => buildGroupEdges(visibleColumns), [visibleColumns]);

  return (
    // Gorizontal chiziq `<tr>` da EMAS, `.matrix-grid td` da (globals.css).
    // Jadval `border-separate` rejimida — bu yopishqoq (sticky) sarlavha va
    // muzlatilgan ustunlar uchun zarur — lekin o'sha rejimda `<tr>` ga
    // qo'yilgan ramka brauzer tomonidan UMUMAN chizilmaydi. Shuning uchun
    // matritsada vertikal chiziqlar bor edi, gorizontallari esa yo'q.
    <tr className="group transition-colors">
      <td className="sticky left-0 z-20 px-2 py-1.5 text-center text-micro font-bold w-10 min-w-[40px] transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
        {idx + 1}
      </td>
      <td
        className="sticky left-10 z-20 px-3 py-1.5 transition-colors w-48 min-w-[192px] cursor-pointer"
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
        onClick={() => row.companyId && onCompanySelect(row.companyId as string)}
      >
        <div className="max-w-[180px] truncate text-meta font-bold transition-colors icon-btn-accent" style={{ color: 'var(--text)' }} title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="md:sticky md:left-[232px] z-20 px-1.5 py-1.5 text-center text-micro font-bold w-20 min-w-[80px] transition-colors group-hover:bg-[var(--surface-2)]" style={{ background: 'var(--surface)', color: 'var(--text-3)', borderRight: '1px solid var(--border)' }}>
        {row.inn || '—'}
      </td>
      <td className="md:sticky md:left-[312px] z-20 px-2 py-1.5 transition-colors w-24 min-w-[96px] group-hover:bg-[var(--surface-2)]" style={{ background: 'var(--surface)', borderRight: '2px solid var(--border)' }}>
        <div className="max-w-[90px] truncate text-micro font-bold" style={{ color: 'var(--text-2)' }} title={row.accountant}>
          {row.accountant || '—'}
        </div>
      </td>
      {showPayment && (
        <td className="px-1.5 py-1.5 text-right whitespace-nowrap" style={{ borderRight: '2px solid var(--border)', background: paymentCellBg(payment) }}>
          <div className="text-micro font-bold tabular-nums" style={{ color: paymentCellColor(payment) }}>
            {payment ? formatNum(payment.collected) : '—'}
          </div>
          {payment && payment.expected > 0 && (
            <div className="text-2xs tabular-nums" style={{ color: 'var(--text-3)' }}>
              / {formatNum(payment.expected)}
            </div>
          )}
        </td>
      )}
      {visibleColumns.map(col => {
        const isReadOnly = !row.companyId || !canEditMatrix(userRole, relations);
        // Xizmat o'chirilgan YOKI bu hisobot firma rejimiga tegishli emas.
        const serviceDisabled = !isServiceEnabled(col.key) || !isRegimeEnabled(col.key);
        const blockReason = regimeBlockReason(col.key, regimeOf);
        const st = getGroupStyle(col.group);
        const isEdge = groupEdges.has(col.key);
        const borderRightStyle = isEdge ? `2px solid ${st.border}` : '1px solid var(--border)';

        if ((col as any).isSplit) {
          const payKey = (col as any).payKey as string;
          const payDisabled = !isServiceEnabled(payKey, col.key) || !isRegimeEnabled(payKey);
          const payBlockReason = regimeBlockReason(payKey, regimeOf);
          return (
            <React.Fragment key={col.key}>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: '1px solid var(--border)', background: serviceDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--success) 6%, ${st.cellBg})` }}>
                {serviceDisabled ? (
                  <Tooltip label={blockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={blockReason ? `Yopiq: ${blockReason}` : undefined}>—</span>
                  </Tooltip>
                ) : (
                  <StatusCell
                    value={String(row[col.key] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofStatusOf(col.key)}
                    proofMine={proofMineOf(col.key)}
                    onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, col.key as string)}
                    onViewProof={() => row.companyId && onViewProof(row.companyId as string, col.key as string)}
                  />
                )}
              </td>
              <td className="px-0.5 py-0.5 text-center h-8" style={{ borderRight: borderRightStyle, background: payDisabled ? 'var(--bg-sunken)' : `color-mix(in srgb, var(--warning) 6%, ${st.cellBg})` }}>
                {payDisabled ? (
                  <Tooltip label={payBlockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={payBlockReason ? `Yopiq: ${payBlockReason}` : undefined}>—</span>
                  </Tooltip>
                ) : (
                  <StatusCell
                    value={String(row[payKey] || '')}
                    onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, payKey as string, String(newValue))}
                    readOnly={isReadOnly}
                    userRole={userRole}
                    relations={relations}
                    proofStatus={proofStatusOf(payKey)}
                    proofMine={proofMineOf(payKey)}
                    onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, payKey as string)}
                    onViewProof={() => row.companyId && onViewProof(row.companyId as string, payKey as string)}
                  />
                )}
              </td>
            </React.Fragment>
          );
        }

        return (
          <td key={col.key} className="px-0.5 py-0.5 text-center h-8 transition-colors group-hover:opacity-90" style={{ borderRight: borderRightStyle, background: serviceDisabled ? 'var(--surface-2)' : st.cellBg }}>
            {serviceDisabled ? (
              <Tooltip label={blockReason ?? undefined} wrapDisabled>
                    <span className="text-micro" style={{ color: 'var(--text-3)' }} aria-label={blockReason ? `Yopiq: ${blockReason}` : undefined}>—</span>
                  </Tooltip>
            ) : (
              <StatusCell
                value={String(row[col.key] || '')}
                onUpdate={(newValue) => row.companyId && onCellUpdate(row.companyId as string, col.key as string, String(newValue))}
                readOnly={isReadOnly}
                userRole={userRole}
                relations={relations}
                proofStatus={proofStatusOf(col.key)}
                proofMine={proofMineOf(col.key)}
                onRequestSubmit={() => row.companyId && onRequestSubmit(row.companyId as string, col.key as string)}
                onViewProof={() => row.companyId && onViewProof(row.companyId as string, col.key as string)}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
});

OperationRow.displayName = "OperationRow";

export default OperationRow;
