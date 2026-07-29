"use client";

import { useState } from "react";
import { compressImageFile } from "@/lib/imageCompress";
import { saveReportProof } from "@/server/proofs";

interface Props {
  companies: Array<{ id: string; name: string }>;
  columns: Array<{ key: string; label: string }>;
  period: string;
}

/**
 * The one-screen upload flow: pick the company, pick the column, take a photo.
 *
 * The image is compressed on the device before it ever leaves it — a raw phone
 * photo is several megabytes and would be pushed through a server action into a
 * `@db.Text` column. `compressImageFile` is the same helper the web matrix uses,
 * so both paths produce the same ~100–400KB JPEG.
 */
export default function ProofUploader({ companies, columns, period }: Props) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [colKey, setColKey] = useState(columns[0]?.key ?? "");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    try {
      setImage(await compressImageFile(file));
    } catch {
      setResult({ ok: false, text: "Rasmni o'qib bo'lmadi." });
    }
  };

  const submit = async () => {
    if (!companyId || !colKey || !image) return;
    setBusy(true);
    setResult(null);
    try {
      const label = columns.find((c) => c.key === colKey)?.label;
      await saveReportProof({ companyId, period, colKey, colLabel: label, imageData: image, note });
      setResult({ ok: true, text: "Yuborildi. Nazoratchi tekshiradi." });
      setImage(null);
      setNote("");
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message || "Yuborib bo'lmadi." });
    } finally {
      setBusy(false);
    }
  };

  if (companies.length === 0) {
    return (
      <div className="tg-center">
        <div className="tg-h1">Korxona yo&apos;q</div>
        <p className="tg-hint">Sizga biriktirilgan korxona topilmadi.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="tg-h1">Dalil yuklash</h1>
      <p className="tg-hint">Davr: {period}</p>

      <div className="tg-field">
        <label className="tg-label" htmlFor="company">Korxona</label>
        <select
          id="company"
          className="tg-select"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="tg-field">
        <label className="tg-label" htmlFor="col">Hisobot</label>
        <select
          id="col"
          className="tg-select"
          value={colKey}
          onChange={(e) => setColKey(e.target.value)}
        >
          {columns.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="tg-field">
        <label className="tg-label" htmlFor="shot">Skrinshot</label>
        {/* `capture` bo'lmagani ataylab: buxgalterda skrinshot allaqachon
            galereyada bo'ladi, kamerani majburlash uni bloklab qo'yardi. */}
        <input
          id="shot"
          className="tg-input"
          type="file"
          accept="image/*"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        {/* next/image ataylab ishlatilmaydi: bu klientda yaratilgan data: URL,
            uni optimizator qayta ishlay olmaydi va faqat yuk qo'shadi. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img className="tg-preview" src={image} alt="Tanlangan skrinshot" />}
      </div>

      <div className="tg-field">
        <label className="tg-label" htmlFor="note">Izoh (ixtiyoriy)</label>
        <input
          id="note"
          className="tg-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Masalan: kvitansiya raqami"
        />
      </div>

      {result && (
        <div className={`tg-note ${result.ok ? "tg-note--ok" : "tg-note--err"}`}>{result.text}</div>
      )}

      <button className="tg-btn" onClick={() => void submit()} disabled={busy || !image}>
        {busy ? "Yuborilmoqda…" : "Yuborish"}
      </button>
    </>
  );
}
