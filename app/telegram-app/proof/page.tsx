import { getProofTargets } from "@/server/telegramApp";
import { BASE_REPORT_COLUMNS } from "@/lib/reportColumns";
import ProofUploader from "./ProofUploader";

export const metadata = { title: "ASRO — dalil yuklash" };

/**
 * Proof upload inside Telegram — the accountant photographs a receipt and it
 * lands in the same `ReportProof` row the web matrix writes, reviewed by the
 * same senior flow. No new storage layer: `saveReportProof` is reused verbatim.
 */
export default async function TelegramProofPage() {
  const { companies, period } = await getProofTargets();

  // Split columns carry a separate "_tolov" pair; both are selectable so a
  // payment receipt can be attached to the payment half, not the report half.
  const columns = BASE_REPORT_COLUMNS.flatMap((c) =>
    c.isSplit && c.payKey
      ? [
          { key: c.key, label: c.label },
          { key: c.payKey, label: `${c.label} — to'lov` },
        ]
      : [{ key: c.key, label: c.label }],
  );

  return <ProofUploader companies={companies} columns={columns} period={period} />;
}
