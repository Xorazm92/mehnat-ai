"use client";

/**
 * SHARTNOMALAR PANELI — firma kartasining "Shartnoma" yorlig'idagi ro'yxat.
 *
 * `CompanyDrawer.tsx` ichida yashardi, lekin unga HECH QANDAY bog'liq emas:
 * o'z ma'lumotini o'zi yuklaydi (`getCompanyContracts`) va faqat `companyId`
 * oladi. Shuning uchun birinchi bo'lib shu ajratildi.
 */
import React, { useState } from "react";
import { FileSignature, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createContract,
  deactivateContract,
  getCompanyContracts,
  updateContract,
} from "@/server/contracts";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DateField } from "@/components/ui/DateField";
import type { ContractRow } from "./types";

export function ContractsPanel({ companyId, initial }: { companyId: string; initial: ContractRow[] }) {
  const [rows, setRows] = useState<ContractRow[]>(initial);
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const fresh = await getCompanyContracts(companyId);
    setRows(
      fresh.map((c: any) => ({
        id: c.id,
        number: c.number,
        signedAt: c.signedAt,
        amount: c.amount == null ? null : Number(c.amount),
        source: c.source,
        isActive: c.isActive,
        ownFirmName: c.ownFirm?.name ?? null,
      }))
    );
  };

  const openNew = () => {
    setEditing(null);
    setAdding(true);
    setNumber('');
    setSignedAt('');
    setAmount('');
    setError(null);
  };

  const openEdit = (row: ContractRow) => {
    setAdding(false);
    setEditing(row);
    setNumber(row.number);
    setSignedAt(row.signedAt ? String(row.signedAt).slice(0, 10) : '');
    setAmount(row.amount != null ? String(row.amount) : '');
    setError(null);
  };

  const close = () => {
    setAdding(false);
    setEditing(null);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        number,
        signedAt: signedAt || null,
        amount: amount ? Number(amount.replace(/[^\d.]/g, '')) : null,
      };
      if (editing) await updateContract(editing.id, payload);
      else await createContract({ companyId, ...payload });
      await reload();
      close();
    } catch (e) {
      setError(friendlyError(e) || 'Saqlab bo\'lmadi');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (row: ContractRow) => {
    setBusy(true);
    setError(null);
    try {
      await deactivateContract(row.id);
      await reload();
    } catch (e) {
      setError(friendlyError(e) || 'Bajarib bo\'lmadi');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg)',
    border: '1px solid var(--card-border)',
    color: 'var(--text)',
  };

  const total = rows.filter(r => r.isActive !== false).reduce((sum, k) => sum + (k.amount ?? 0), 0);

  return (
    <div className="dashboard-card overflow-hidden !shadow-sm">
      <div
        className="px-3 py-2 flex items-center justify-between gap-2"
        style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}
      >
        <h3 className="text-micro font-bold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
          Shartnomalar ({rows.length})
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-micro font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {formatNum(total)} so&apos;m
          </span>
          <Button variant="primary" size="sm" onClick={openNew} icon={<Plus size={12} />}>
            Qo&apos;shish
          </Button>
        </div>
      </div>

      {error && (
        <p className="px-3 py-2 text-micro" style={{ color: 'var(--danger)' }}>{error}</p>
      )}

      {(adding || editing) && (
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Shartnoma raqami *</span>
              <input
                className="w-full mt-1 px-2 py-1.5 rounded text-meta outline-none"
                style={inputStyle}
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="02/26BK"
              />
            </label>
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Sana</span>
              <DateField
                className="mt-1"
                inputClassName="w-full px-2 py-1.5 rounded text-meta outline-none"
                inputStyle={inputStyle}
                value={signedAt}
                onChange={setSignedAt}
              />
            </label>
            <label className="block">
              <span className="text-micro" style={{ color: 'var(--text-muted)' }}>Oylik summa (so&apos;m)</span>
              <input
                inputMode="numeric"
                className="w-full mt-1 px-2 py-1.5 rounded text-meta text-right tabular-nums outline-none"
                style={inputStyle}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="3000000"
              />
            </label>
          </div>
          <p className="text-micro" style={{ color: 'var(--text-muted)' }}>
            To&apos;lov turi (naqd / plastik / bank) shartnomada emas — u har bir to&apos;lovda
            kirim kassasida tanlanadi.
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!number.trim()}
              loading={busy}
              onClick={save}
            >
              {busy ? 'Saqlanmoqda…' : 'Saqlash'}
            </Button>
            <Button variant="secondary" size="sm" onClick={close}>
              Bekor qilish
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileSignature size={28} />}
          title="Shartnoma kiritilmagan"
          description="Firma bilan tuzilgan shartnomani qo'shsangiz, oylik summa moliyaviy prognozga qo'shiladi."
          action={
            <Button variant="secondary" size="sm" onClick={openNew} icon={<Plus size={12} />}>
              Shartnoma qo&apos;shish
            </Button>
          }
        />
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
          {rows.map(k => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
              style={{ opacity: k.isActive === false ? 0.5 : 1 }}
            >
              <div className="min-w-0">
                <p className="text-body font-semibold tracking-tight truncate" style={{ color: 'var(--text)' }}>
                  {k.number}
                  {k.isActive === false && (
                    <span className="text-micro ml-2" style={{ color: 'var(--text-muted)' }}>nofaol</span>
                  )}
                </p>
                <p className="text-micro" style={{ color: 'var(--text-muted)' }}>
                  {k.signedAt ? formatUzDate(k.signedAt) : 'sana ko\'rsatilmagan'}
                  {k.ownFirmName ? ` · ${k.ownFirmName}` : ''}
                  {k.source === '1c_import' ? ' · 1C' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-body font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--text)' }}>
                  {k.amount != null ? `${formatNum(k.amount)} so'm` : '—'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(k)}
                  title="Tahrirlash"
                  aria-label={`${k.number} shartnomasini tahrirlash`}
                  icon={<Pencil size={14} />}
                />
                {k.isActive !== false && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deactivate(k)}
                    disabled={busy}
                    title="Nofaol qilish (o'chirilmaydi — to'lovlar tarixi saqlanadi)"
                    aria-label={`${k.number} shartnomasini nofaol qilish`}
                    icon={<Trash2 size={14} />}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContractsPanel;
