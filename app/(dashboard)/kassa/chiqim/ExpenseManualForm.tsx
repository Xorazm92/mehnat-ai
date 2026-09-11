"use client";

// QO'LDA CHIQIM — xodim kartasidan sarflangan pulni yozish.
//
// Karta tranzit hisobi: pul korxonadan chiqmagan, faqat xodim cho'ntagida.
// Sarflangach u HAQIQIY xarajatga aylanadi va aynan shu forma o'sha
// o'tishni qayd etadi.
//
// `ChiqimKassaClient` 1100 qator edi va bu forma uning oxirida, ikkita
// boshqa modal bilan yonma-yon turardi.

import React, { useState } from "react";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { DateField } from "@/components/ui/DateField";
import { Select } from "@/components/ui/Select";
import { formatNum, todayKey, submitOnCtrlEnter } from "@/lib/platform/format";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/bank/classifyExpense";
import type { Channel } from "./types";

/** Modal pastidagi tugma formadan tashqarida — `form` atributi orqali bog'lanadi. */
const SPEND_FORM_ID = "spend-form";

const SPEND_CATEGORIES = ["ijara", "aloqa", "ovqat", "soliq", "bank_komissiya", "boshqa"] as const;


export default function ExpenseManualForm({
  channel, busy, onCancel, onSave,
}: {
  channel: Channel;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { amount: number; date: string; category: string; description?: string }) => void;
}) {
  const [amount, setAmount] = useState<number | null>(null);
  // Toshkent kalendari — UTC standart tunda kecha sanani berardi.
  const [date, setDate] = useState(todayKey());
  const [category, setCategory] = useState<string>("ijara");
  const [description, setDescription] = useState("");

  const value = amount ?? 0;
  // Qoldiqdan ortiq sarf — server ham to'sadi, bu faqat oldindan ogohlantirish.
  const over = value > channel.balance;
  const canSave = !busy && value > 0 && !over;

  const submit = () => {
    if (!canSave) return;
    onSave({ amount: value, date, category, description });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      dismissable={!busy}
      size="lg"
      title={`${channel.label} — xarajat yozish`}
      description={`Kanal qoldig'i: ${formatNum(channel.balance)} so'm`}
      footer={
        <>
          <Button type="button" variant="secondary" size="md" disabled={busy} onClick={onCancel}>
            Bekor qilish
          </Button>
          <Button type="submit" form={SPEND_FORM_ID} variant="primary" size="md" loading={busy} disabled={!canSave}>
            Yozish
          </Button>
        </>
      }
    >
      <form
        id={SPEND_FORM_ID}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={submitOnCtrlEnter(submit)}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Summa"
            required
            error={over ? `Qoldiqdan ${formatNum(value - channel.balance)} so'm ortiq — bunday yozuvga yo'l qo'yilmaydi.` : null}
          >
            <MoneyField value={amount} onChange={setAmount} placeholder="10 000 000" />
          </Field>
          <Field label="Sana" required>
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Toifa" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c as never] ?? c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Izoh">
            <input
              className="erp-input w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ixtiyoriy"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
