"use client";

// XODIM KARTASI / PUL KANALI — yaratish formasi.
//
// Kanal — pul QAYERDA turgani: o'z bank hisobi, naqd seyf yoki xodim
// kartasi. Har chiqim aynan bitta kanaldan chiqadi, shuning uchun kanalsiz
// yozuv "qaysi kassa kamaydi?" degan savolga javob bera olmaydi.

import React, { useState } from "react";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { submitOnCtrlEnter } from "@/lib/platform/format";
import { CHANNEL_TYPE_LABELS, type ChannelType } from "@/lib/transitChannels";

/** Modal pastidagi tugma formadan tashqarida — `form` atributi orqali bog'lanadi. */
const CHANNEL_FORM_ID = "channel-form";

export default function ExpenseChannelForm({
  open, employees, busy, onCancel, onSave,
}: {
  open: boolean;
  employees: { id: string; fullName: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (p: { type: ChannelType; label: string; employeeId: string | null; cardMask: string | null }) => void;
}) {
  const [label, setLabel] = useState("");
  const [cardMask, setCardMask] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<ChannelType>("employee_card");

  const submit = () => {
    if (!label.trim()) return;
    onSave({ type, label, cardMask: cardMask || null, employeeId: employeeId || null });
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      dismissable={!busy}
      size="lg"
      title="Yangi kanal"
      description="Pul qaysi karta yoki seyf orqali o'tishini shu yerda ro'yxatga olasiz."
      footer={
        <>
          <Button type="button" variant="secondary" size="md" disabled={busy} onClick={onCancel}>
            Bekor qilish
          </Button>
          <Button type="submit" form={CHANNEL_FORM_ID} variant="primary" size="md" loading={busy} disabled={busy || !label.trim()}>
            Saqlash
          </Button>
        </>
      }
    >
      <form
        id={CHANNEL_FORM_ID}
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={submitOnCtrlEnter(submit)}
        className="space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Turi" required>
            <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
              {(Object.keys(CHANNEL_TYPE_LABELS) as ChannelType[]).map((t) => (
                <option key={t} value={t}>{CHANNEL_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nom" required>
            <input
              className="erp-input w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Masalan: Uchqun Azimboyev"
            />
          </Field>
          <Field
            label="Karta niqobi"
            hint="To'liq karta raqami saqlanmaydi — faqat niqob (birinchi 4 va oxirgi 4 raqam)."
          >
            <input
              className="erp-input w-full"
              value={cardMask}
              onChange={(e) => setCardMask(e.target.value)}
              placeholder="8600****4957"
            />
          </Field>
          <Field label="Xodim (ixtiyoriy)">
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="— Bog'lanmagan —">
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
