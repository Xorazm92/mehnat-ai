"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save, Archive, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatNum } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { upsertService, archiveService } from "@/server/services";
import { Select } from "@/components/ui";

interface ServiceRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  defaultPrice: string | number | null;
  periodicity: string;
  isActive: boolean;
  sortOrder: number;
  _count?: { companyServices: number };
}

interface RevenueRow {
  serviceId: string;
  key: string;
  name: string;
  companyCount: number;
  monthlyAmount: number;
}

const PERIODICITY_LABELS: Record<string, string> = {
  monthly: "Oylik",
  quarterly: "Choraklik",
  yearly: "Yillik",
  one_time: "Bir martalik",
};

const card = { background: "var(--card-bg)", border: "1px solid var(--card-border)" };
const inputCls = "w-full px-3 py-2 rounded-lg text-body outline-none";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text-primary)",
} as const;

type Draft = {
  id?: string;
  key: string;
  name: string;
  description: string;
  defaultPrice: string;
  periodicity: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyDraft = (): Draft => ({
  key: "",
  name: "",
  description: "",
  defaultPrice: "",
  periodicity: "monthly",
  sortOrder: "0",
  isActive: true,
});

const toDraft = (s: ServiceRow): Draft => ({
  id: s.id,
  key: s.key,
  name: s.name,
  description: s.description ?? "",
  defaultPrice: s.defaultPrice != null ? String(Number(s.defaultPrice)) : "",
  periodicity: s.periodicity,
  sortOrder: String(s.sortOrder),
  isActive: s.isActive,
});

export default function ServiceCatalogClient({
  services,
  revenue,
}: {
  services: ServiceRow[];
  revenue: RevenueRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const totalMonthly = revenue.reduce((s, r) => s + r.monthlyAmount, 0);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await upsertService({
        id: draft.id,
        key: draft.key,
        name: draft.name,
        description: draft.description || null,
        // Bo'sh maydon = "narx belgilanmagan", nol EMAS: nol "bepul xizmat"
        // degani va tijorat hisobotida boshqacha o'qiladi.
        defaultPrice: draft.defaultPrice.trim() === "" ? null : Number(draft.defaultPrice),
        periodicity: draft.periodicity,
        sortOrder: Number(draft.sortOrder) || 0,
        isActive: draft.isActive,
      });
      toast.success("Saqlandi");
      setDraft(null);
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (s: ServiceRow) => {
    setBusy(true);
    try {
      await archiveService(s.id);
      toast.success(`"${s.name}" arxivlandi`);
      router.refresh();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Xizmat katalogi
          </h1>
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Mijozga sotiladigan xizmatlar va tavsiya narxi. Matritsa ustunlari bilan
            aralashtirmang — ular &laquo;Amallar matritsasi&raquo; ekranida.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())} disabled={busy}>
          <Plus size={16} /> Yangi xizmat
        </Button>
      </div>

      {draft && (
        <div className="p-5 rounded-xl space-y-3" style={card}>
          <div className="flex items-center justify-between">
            <div className="text-micro font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              {draft.id ? "Xizmatni tahrirlash" : "Yangi xizmat"}
            </div>
            <button onClick={() => setDraft(null)} aria-label="Yopish">
              <X size={16} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Kalit</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={draft.key}
                disabled={!!draft.id}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="buxgalteriya"
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Nomi</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Tavsiya narxi (so&apos;m)</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                inputMode="numeric"
                value={draft.defaultPrice}
                onChange={(e) => setDraft({ ...draft, defaultPrice: e.target.value.replace(/[^\d]/g, "") })}
                placeholder="belgilanmagan"
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Davriylik</span>
              <Select
 className="mt-1"

 value={draft.periodicity}
 onChange={(e) => setDraft({ ...draft, periodicity: e.target.value })}
 >
                {Object.entries(PERIODICITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Izoh</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Tartib</span>
              <input
                className={inputCls + " mt-1"}
                style={inputStyle}
                inputMode="numeric"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value.replace(/[^\d]/g, "") })}
              />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              <span className="text-meta font-semibold" style={{ color: "var(--text-secondary)" }}>Faol</span>
            </label>
          </div>

          <Button onClick={save} disabled={busy}>
            <Save size={16} /> Saqlash
          </Button>
        </div>
      )}

      <div className="p-5 rounded-xl" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
          Katalog
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-meta text-left">
                <th className="py-2 pr-3">Xizmat</th>
                <th className="py-2 pr-3">Kalit</th>
                <th className="py-2 pr-3">Davriylik</th>
                <th className="py-2 pr-3 text-right">Tavsiya narxi</th>
                <th className="py-2 pr-3 text-right">Firmalar</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--card-border)", opacity: s.isActive ? 1 : 0.5 }}>
                  <td className="py-2 pr-3">
                    <button className="font-medium text-left" style={{ color: "var(--text-primary)" }} onClick={() => setDraft(toDraft(s))}>
                      {s.name}
                    </button>
                    {s.description && (
                      <div className="text-meta" style={{ color: "var(--text-muted)" }}>{s.description}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-meta" style={{ color: "var(--text-muted)" }}>{s.key}</td>
                  <td className="py-2 pr-3">{PERIODICITY_LABELS[s.periodicity] ?? s.periodicity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {s.defaultPrice != null ? formatNum(Number(s.defaultPrice)) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s._count?.companyServices ?? 0}</td>
                  <td className="py-2 text-right">
                    {s.isActive && (
                      <button onClick={() => archive(s)} disabled={busy} title="Arxivlash">
                        <Archive size={15} style={{ color: "var(--text-muted)" }} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-5 rounded-xl" style={card}>
        <div className="text-micro font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
          Xizmat kesimida daromad
        </div>
        <p className="text-meta mb-3" style={{ color: "var(--text-muted)" }}>
          Faol mijozlarga biriktirilgan xizmatlarning oylik rejasi (narx × miqdor).
          Haqiqiy tushum emas — u qarzdorlik ekranida.
        </p>
        {revenue.length === 0 ? (
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            Hali bironta firmaga xizmat biriktirilmagan.
          </p>
        ) : (
          <table className="w-full text-body">
            <tbody>
              {revenue.map((r) => (
                <tr key={r.serviceId} style={{ borderTop: "1px solid var(--card-border)" }}>
                  <td className="py-2">{r.name}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.companyCount} firma
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">{formatNum(r.monthlyAmount)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid var(--card-border)" }}>
                <td className="py-2 font-semibold">Jami</td>
                <td />
                <td className="py-2 text-right tabular-nums font-semibold">{formatNum(totalMonthly)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
