"use client";

// Firma bo'yicha TIJORAT xizmatlari — nima uchun pul to'lanadi va qancha.
//
// Shu drawer'dagi "Aktiv Xizmatlar" katakchalari bilan ADASHTIRMANG: ular
// matritsa USTUNLARI (qaysi katak to'ldiriladi), narxi yo'q. Ikkalasi bir
// ekranda turadi, chunki foydalanuvchi uchun ikkalasi ham "xizmat" — lekin
// biri ish rejasi, ikkinchisi hisob-kitob.

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { formatNum } from "@/lib/format";
import { friendlyError } from "@/lib/actionError";
import {
  listServices,
  getCompanyServices,
  setCompanyService,
  removeCompanyService,
} from "@/server/services";

interface Catalog {
  id: string;
  key: string;
  name: string;
  defaultPrice: string | number | null;
  periodicity: string;
}

interface Assigned {
  id: string;
  serviceId: string;
  price: string | number | null;
  qty: number;
  isActive: boolean;
  service: Catalog;
}

const inputCls = "px-2 py-1 rounded-lg text-body outline-none w-32 text-right tabular-nums";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--card-border)",
  color: "var(--text-primary)",
} as const;

export default function CompanyServicesPanel({ companyId }: { companyId: string }) {
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [assigned, setAssigned] = useState<Assigned[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [cat, mine] = await Promise.all([listServices(), getCompanyServices(companyId)]);
      setCatalog(cat as unknown as Catalog[]);
      setAssigned(mine as unknown as Assigned[]);
    } catch (e) {
      toast.error(friendlyError(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const effectivePrice = (a: Assigned) =>
    Number(a.price ?? a.service.defaultPrice ?? 0) * a.qty;

  const total = assigned.filter((a) => a.isActive).reduce((s, a) => s + effectivePrice(a), 0);

  const save = async (a: Assigned, patch: { price?: number | null; qty?: number; isActive?: boolean }) => {
    setBusy(true);
    try {
      await setCompanyService({
        companyId,
        serviceId: a.serviceId,
        price: patch.price !== undefined ? patch.price : a.price != null ? Number(a.price) : null,
        qty: patch.qty ?? a.qty,
        isActive: patch.isActive ?? a.isActive,
      });
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (!addId) return;
    setBusy(true);
    try {
      await setCompanyService({ companyId, serviceId: addId });
      setAddId("");
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a: Assigned) => {
    setBusy(true);
    try {
      await removeCompanyService(companyId, a.serviceId);
      await load();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const unassigned = catalog.filter((c) => !assigned.some((a) => a.serviceId === c.id));

  return (
    <div className="dashboard-card p-5 !shadow-sm">
      <div className="mb-4 pb-3 border-b" style={{ borderColor: "var(--card-border)" }}>
        <h4 className="text-meta font-semibold uppercase tracking-widest" style={{ color: "var(--text)" }}>
          Tijorat xizmatlari
        </h4>
        <p className="text-micro mt-1" style={{ color: "var(--text-muted)" }}>
          Mijoz nima uchun to&apos;laydi. Narx bo&apos;sh bo&apos;lsa katalogdagi tavsiya narxi olinadi.
        </p>
      </div>

      {loading ? (
        <p className="text-meta" style={{ color: "var(--text-muted)" }}>Yuklanmoqda…</p>
      ) : (
        <>
          {assigned.length === 0 ? (
            <p className="text-meta mb-4" style={{ color: "var(--text-muted)" }}>
              Hali xizmat biriktirilmagan.
            </p>
          ) : (
            <table className="w-full text-body mb-4">
              <thead>
                <tr className="text-meta text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="py-1">Xizmat</th>
                  <th className="py-1 text-right">Narx</th>
                  <th className="py-1 text-right">Soni</th>
                  <th className="py-1 text-right">Jami</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assigned.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--card-border)", opacity: a.isActive ? 1 : 0.5 }}>
                    <td className="py-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={a.isActive}
                          disabled={busy}
                          onChange={(e) => save(a, { isActive: e.target.checked })}
                        />
                        <span>{a.service.name}</span>
                      </label>
                    </td>
                    <td className="py-2 text-right">
                      <input
                        className={inputCls}
                        style={inputStyle}
                        inputMode="numeric"
                        disabled={busy}
                        defaultValue={a.price != null ? String(Number(a.price)) : ""}
                        placeholder={
                          a.service.defaultPrice != null ? formatNum(Number(a.service.defaultPrice)) : "—"
                        }
                        onBlur={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          const next = raw === "" ? null : Number(raw);
                          const current = a.price != null ? Number(a.price) : null;
                          if (next !== current) save(a, { price: next });
                        }}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <input
                        className={inputCls + " !w-16"}
                        style={inputStyle}
                        inputMode="numeric"
                        disabled={busy}
                        defaultValue={a.qty}
                        onBlur={(e) => {
                          const next = Number(e.target.value.replace(/[^\d]/g, "")) || 1;
                          if (next !== a.qty) save(a, { qty: next });
                        }}
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {formatNum(effectivePrice(a))}
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => remove(a)} disabled={busy} title="Olib tashlash">
                        <Trash2 size={15} style={{ color: "var(--danger)" }} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid var(--card-border)" }}>
                  <td className="py-2 font-semibold">Jami (oylik)</td>
                  <td /><td />
                  <td className="py-2 text-right tabular-nums font-semibold">{formatNum(total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}

          {unassigned.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="px-3 py-2 rounded-lg text-body outline-none flex-1"
                style={inputStyle}
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">Xizmat tanlang…</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={busy || !addId}
                className="px-3 py-2 text-micro font-semibold rounded-lg uppercase tracking-widest flex items-center gap-1"
                style={{
                  color: "var(--success)",
                  background: "color-mix(in srgb, var(--success) 10%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)",
                }}
              >
                <Plus size={14} /> Qo&apos;shish
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
