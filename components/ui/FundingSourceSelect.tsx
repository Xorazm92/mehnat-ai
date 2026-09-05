"use client";

// =====================================================
// PUL MANBAI TANLAGICHI — "pul qaysi hisobdan chiqdi/kirdi"
// =====================================================
//
// Bitta tanlov ikki turni qamraydi (server/fundingSources.ts):
// TO'RT TUR: bank hisobi (schyot), naqd kassa (seyf), plastik terminal va
// xodim kartasi. Ilgari tanlagich faqat IKKITASINI bilardi va qolgani
// "xodim kartasi" guruhiga tushib qolardi — shu sababdan naqd va plastik
// kassalar umuman ochilmagan edi.
//
// Uch formada ishlatiladi: xarajat, chiqim kassa, kirim kassa. Ro'yxat
// serverdan bir joydan keladi — aks holda uch ekranda uch xil filtr paydo
// bo'lardi va "qaysi schyot" savoli har birida boshqacha javob berardi.

import React, { useEffect, useState } from "react";
import { getFundingSources, type FundingSourceGroups } from "@/server/fundingSources";
import { CHANNEL_TYPE_LABELS, CHANNEL_TYPE_ORDER } from "@/lib/transitChannels";
import { friendlyError } from "@/lib/actionError";
import { Select } from "./Select";

interface Props {
  value: string;
  onChange: (channelId: string) => void;
  /** Bo'sh tanlovga ruxsat (tahrirlashda eski manbasiz yozuv uchun). */
  allowEmpty?: boolean;
  className?: string;
  disabled?: boolean;
  /**
   * `Field` primitivi bilan bog'lash uchun. Field yorliqqa `htmlFor` qo'yadi
   * va bolasiga shu `id` ni uzatadi — tanlagich uni qabul qilmasa yorliq
   * hech qayerga ishora qilmay qoladi (`CompanySelect` da ham shu naqsh).
   */
  id?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

export const FundingSourceSelect: React.FC<Props> = ({
  value,
  onChange,
  allowEmpty = false,
  className = "",
  disabled,
  id,
  ...aria
}) => {
  const [groups, setGroups] = useState<FundingSourceGroups | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFundingSources()
      .then((g) => alive && setGroups(g))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p className="text-micro" style={{ color: "var(--danger)" }}>Manbalar yuklanmadi: {error}</p>;
  }

  const total = groups
    ? CHANNEL_TYPE_ORDER.reduce((n, t) => n + (groups[t]?.length ?? 0), 0)
    : 0;

  // Bitta ham kanal yo'q bo'lsa jim bo'sh ro'yxat ko'rsatmaymiz — foydalanuvchi
  // nima qilishini bilishi kerak.
  if (groups && total === 0) {
    return (
      <p className="text-micro" style={{ color: "var(--warning)" }}>
        Kassa ochilmagan. <a href="/kassa/chiqim" className="underline">Chiqim kassa</a> →
        &quot;Kanal qo&apos;shish&quot; orqali naqd kassa yoki plastik terminal oching.
      </p>
    );
  }

  return (
    // Uslub `Select` primitivida: bu yerda faqat DOMEN (qaysi kanallar,
    // qanday guruhlangan). Ilgari bu fayl ham o'z tokenli uslubini yozardi va
    // u `--card-border` ni ishlatardi, `.erp-input` esa `--input-border` ni —
    // ikkita tanlagich yonma-yon turganda ramka rangi farq qilardi.
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || !groups}
      className={className}
      placeholder={allowEmpty ? "— Tanlanmagan —" : "Manbani tanlang…"}
      aria-describedby={aria["aria-describedby"]}
      aria-required={aria["aria-required"]}
      invalid={aria["aria-invalid"]}
    >
      {groups &&
        CHANNEL_TYPE_ORDER.filter((t) => (groups[t]?.length ?? 0) > 0).map((t) => (
          <optgroup key={t} label={CHANNEL_TYPE_LABELS[t]}>
            {groups[t].map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.detail ? ` · ${s.detail}` : ""}
                {s.ownFirmName ? ` · ${s.ownFirmName}` : ""}
              </option>
            ))}
          </optgroup>
        ))}
    </Select>
  );
};

export default FundingSourceSelect;
