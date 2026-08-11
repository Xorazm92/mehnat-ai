"use client";

// =====================================================
// PUL MANBAI TANLAGICHI — "pul qaysi hisobdan chiqdi/kirdi"
// =====================================================
//
// Bitta tanlov ikki turni qamraydi (server/fundingSources.ts):
//   SCHYOT  — o'z firmaning bank hisobi (`own_firm_account`)
//   PLASTIK — xodimga berilgan karta      (`employee_card`)
//
// Uch formada ishlatiladi: xarajat, chiqim kassa, kirim kassa. Ro'yxat
// serverdan bir joydan keladi — aks holda uch ekranda uch xil filtr paydo
// bo'lardi va "qaysi schyot" savoli har birida boshqacha javob berardi.

import React, { useEffect, useState } from "react";
import { getFundingSources, type FundingSourceGroups } from "@/server/fundingSources";

interface Props {
  value: string;
  onChange: (channelId: string) => void;
  /** Bo'sh tanlovga ruxsat (tahrirlashda eski manbasiz yozuv uchun). */
  allowEmpty?: boolean;
  className?: string;
  disabled?: boolean;
}

export const FundingSourceSelect: React.FC<Props> = ({
  value,
  onChange,
  allowEmpty = false,
  className = "",
  disabled,
}) => {
  const [groups, setGroups] = useState<FundingSourceGroups | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFundingSources()
      .then((g) => alive && setGroups(g))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="text-micro" style={{ color: "var(--danger)" }}>Manbalar yuklanmadi: {error}</p>;
  }

  const loading = groups === null;
  const empty = !loading && groups.accounts.length === 0 && groups.cards.length === 0;

  return (
    <div>
      <select
        value={value}
        disabled={disabled || loading || empty}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {/* Bo'sh variant HAR DOIM bor: majburiy bo'lsa ham foydalanuvchi
            "tanlanmagan" holatni ko'rishi kerak, aks holda ro'yxatdagi
            birinchi manba jimgina tanlangandek ko'rinardi. */}
        <option value="">
          {loading ? "Yuklanmoqda…" : empty ? "Manba topilmadi" : "— Pul manbaini tanlang —"}
        </option>

        {groups && groups.accounts.length > 0 && (
          <optgroup label="SCHYOT (o'z firma hisobi)">
            {groups.accounts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.detail ? ` · ${s.detail}` : ""}
              </option>
            ))}
          </optgroup>
        )}

        {groups && groups.cards.length > 0 && (
          <optgroup label="PLASTIK (xodim kartasi)">
            {groups.cards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.detail ? ` · ${s.detail}` : ""}
                {s.ownFirmName ? ` — ${s.ownFirmName}` : ""}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {empty && (
        <p className="text-micro mt-1" style={{ color: "var(--text-3)" }}>
          Schyot kanallari hali yaratilmagan: <code>npm run seed:own-accounts -- --apply</code>
        </p>
      )}
      {!allowEmpty && !loading && !empty && !value && (
        <p className="text-micro mt-1" style={{ color: "var(--warning)" }}>
          Manba tanlanmagan — pul qayerdan chiqqani yozilmaydi.
        </p>
      )}
    </div>
  );
};

export default FundingSourceSelect;
