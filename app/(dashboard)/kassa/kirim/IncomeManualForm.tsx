"use client";

// =====================================================
// QO'LDA TUSHUM KIRITISH — naqd / plastik / offset
// =====================================================
//
// Vipiskada ko'rinmaydigan tushum: naqd va plastik pulni odam kiritadi.
// "offset" — vzaimozachyot/ijara: pul HECH QAYERGA tushmaydi (kanal
// so'ralmaydi), lekin mijozning qarzini yopadi.
//
// NEGA ALOHIDA FAYL. `KirimKassaClient` 1329 qator edi va uning ichida uch
// mustaqil ish aralash turardi: fayl yuklash, navbat va shu forma. Forma
// o'z holatining o'n bitta maydonini olib yuradi — ular ota komponentda
// yashaganda "bu `useState` qaysi ishga tegishli?" degan savol har safar
// qaytadan tug'ilardi.
//
// TURNI OTA KOMPONENT BOSHQARADI (`type` prop): "Naqd / Plastik / Offset"
// tugmalari sahifa sarlavhasida turadi va ular formani OCHADI. Forma esa
// o'z maydonlarini o'zi tozalaydi — yopilish har doim toza holat qoldiradi.

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
import { DateField } from "@/components/ui/DateField";
import { CompanySelect } from "@/components/ui/CompanySelect";
import { Select } from "@/components/ui/Select";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { todayKey, formatNum, submitOnCtrlEnter } from "@/lib/platform/format";
import { friendlyError } from "@/lib/actionError";
import { recordManualReceipt, checkDuplicateReceipt } from "@/server/bank/post";
import { getServiceTermInfo } from "@/server/companies";

export type ManualReceiptType = "naqd" | "plastik" | "offset";

export interface ManualFormCompany {
  id: string;
  name: string;
  inn: string;
  contracts: { id: string; number: string | null }[];
}

export interface IncomeManualFormProps {
  /** `null` — forma yopiq. Tur ota komponentdagi tugmalardan keladi. */
  type: ManualReceiptType | null;
  companies: ManualFormCompany[];
  onClose: () => void;
  /** Muvaffaqiyatli yozuvdan keyin — ota komponent ro'yxatlarni yangilaydi. */
  onSaved: () => void;
}

/** Modal pastidagi tugma formadan tashqarida — `form` atributi orqali bog'lanadi. */
const MANUAL_FORM_ID = "manual-receipt-form";

/**
 * Formadagi mantiqiy bo'lim sarlavhasi. Uzun forma bo'limlarga ajratilmasa
 * o'n bitta maydon bir tekis oqim bo'lib ko'rinadi va "qaysi maydon nimaga
 * tegishli" degan savol har safar qaytadan tug'iladi.
 */
function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3
        className="text-meta font-bold uppercase tracking-widest pb-1.5"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--rule)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function IncomeManualForm({ type, companies, onClose, onSaved }: IncomeManualFormProps) {
  // dan belgilangan oylik limitdan oshirib bo'lmaydi (server tekshiradi).
  // KIMDAN tushdi. Bu maydon yo'q edi va aynan shu sababli qo'lda kiritilgan
  // naqd to'lov mijozning qarzini kamaytirmasdi — yozuv hech kimga
  // bog'lanmagan `KassaEntry` bo'lib qolardi.
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualContractId, setManualContractId] = useState("");
  const [manualDocRef, setManualDocRef] = useState("");
  /** Takroriylik ogohlantirishi — foydalanuvchi tasdiqlagach saqlanadi. */
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [manualNote, setManualNote] = useState("");
  // Toshkent kalendari — UTC `toISOString` kechki tunda KECCHA sanani
  // berib qo'yardi (prod server UTC da yuradi).
  const [manualDate, setManualDate] = useState(() => todayKey());
  // Tushum QAYSI kassaga kirgani — naqd uchun ham, plastik uchun ham.
  //
  // Ilgari faqat plastikda so'ralardi. Natijada naqd tushum kanalsiz yozilar
  // va "qaysi seyfga tushdi?" degan savolga baza javob bera olmasdi — prodda
  // 691 kassa yozuvining HAMMASI shu sababdan kanalsiz.
  const [manualChannelId, setManualChannelId] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  // Tasdiq dialogi — `(dashboard)` layoutidagi `ConfirmProvider` dan.
  const confirm = useConfirm();
  const [manualError, setManualError] = useState<string | null>(null);

  // Firma tanlanganda — shu oy uchun shartnomada belgilangan qism qancha
  // qolganini ko'rsatamiz (server baribir tekshiradi, bu faqat oldindan
  // ogohlantirish — kassir summani kiritishdan oldin bilib olsin).
  //
  // Plastik/naqdda cap = 0 "limit belgilanmagan" degani (shartnoma hali
  // eski, ikki qismli split bilan yozilgan) — server ham bunda to'smaydi,
  // shuning uchun bu yerda ham ogohlantirish ko'rsatilmaydi.
  const [sourceCap, setSourceCap] = useState<{ cap: number; used: number } | null>(null);
  useEffect(() => {
    if (!type || !manualCompanyId) {
      setSourceCap(null);
      return;
    }
    let cancelled = false;
    getServiceTermInfo(manualCompanyId)
      .then((info: any) => {
        if (cancelled) return;
        const cap = Number(
          type === "offset"
            ? (info.current?.offsetAmount ?? 0)
            : type === "plastik"
              ? (info.current?.plastikAmount ?? 0)
              : (info.current?.naqdAmount ?? 0)
        );
        const used = Number(
          type === "offset"
            ? (info.usedOffsetThisPeriod ?? 0)
            : type === "plastik"
              ? (info.usedPlastikThisPeriod ?? 0)
              : (info.usedNaqdThisPeriod ?? 0)
        );
        setSourceCap(type !== "offset" && cap === 0 ? null : { cap, used });
      })
      .catch(() => { if (!cancelled) setSourceCap(null); });
    return () => { cancelled = true; };
  }, [type, manualCompanyId]);

  const capLabel = type === "offset" ? "offset" : type === "plastik" ? "plastik" : "naqd";
  const capNotice = manualCompanyId && sourceCap && (
    <p className="text-micro" style={{ color: sourceCap.used >= sourceCap.cap ? "var(--danger)" : "var(--text-muted)" }}>
      Shu oy uchun {capLabel} limiti: {formatNum(sourceCap.cap)} so&apos;m,
      ishlatilgan: {formatNum(sourceCap.used)} so&apos;m,
      qoldi: {formatNum(Math.max(0, sourceCap.cap - sourceCap.used))} so&apos;m.
      {sourceCap.cap === 0 && " (Bu firmada offset split belgilanmagan — \"Narxni o'zgartirish\" orqali sozlang.)"}
    </p>
  );
  /**
   * Yopilish — maydonlar TOZALANADI, keyin ota komponentga xabar beriladi.
   *
   * Ilgari bu funksiya turni ham nolga tushirardi (`setManualType(null)`);
   * endi turni ota komponent boshqaradi. Tozalashsiz yopish keyingi
   * ochilishda eski firma va summani qoldirardi — kassir buni sezmay
   * "Saqlash" bosishi mumkin edi.
   */
  const resetManual = () => {
    // Xato ham tozalanadi. Ilgari buni OTA komponent qilardi — forma ochilishida
    // (`setManualError(null)` uch tugmada takrorlangan edi). Yopilishda tozalash
    // bir joyda turadi va uchta chaqiruvdan birini unutish imkoniyati yo'qoladi.
    setManualError(null);
    setManualAmount(null);
    setManualNote("");
    setManualChannelId("");
    setManualCompanyId("");
    setManualContractId("");
    setManualDocRef("");
    onClose();
  };

  const submitManual = async (opts?: { force?: boolean }) => {
    if (!type) return;
    // `MoneyField` tashqariga har doim SON beradi (ajratkich faqat ko'rinishda).
    const amount = manualAmount ?? 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError("Summa musbat son bo'lishi kerak");
      return;
    }
    if (type === "offset") {
      // Offset pul hech qayerga tushmaydi — kanal emas, FIRMA majburiy
      // (aks holda "kimning qarzi yopilyapti" degan savolga javob yo'q).
      if (!manualCompanyId) {
        setManualError("Offset faqat firma tanlanganda kiritiladi");
        return;
      }
    } else if (!manualChannelId) {
      // MANBA IKKALASIDA HAM MAJBURIY: pul qaysi kassaga tushganini bilmasak,
      // o'sha kassaning qoldig'i hech qachon to'g'ri chiqmaydi va kassalar
      // hisobotini qurib bo'lmaydi.
      setManualError(
        type === "plastik"
          ? "Qaysi plastikka tushganini tanlang"
          : "Qaysi naqd kassaga tushganini tanlang"
      );
      return;
    }
    setManualBusy(true);
    setManualError(null);
    try {
      const receivedAt = new Date(manualDate);

      // Yumshoq ogohlantirish: ±1 kun ichida shu firmadan shu summa
      // allaqachon kelgan bo'lsa, saqlashdan oldin tasdiq so'raymiz.
      // Qattiq to'siq (dedupKey) serverda, lekin u faqat AYNAN bir xil
      // kalitni ushlaydi — kassir bir kun farq bilan kiritsa o'tib ketardi.
      if (!opts?.force && manualCompanyId) {
        const { duplicates } = await checkDuplicateReceipt({
          companyId: manualCompanyId,
          amount,
          receivedAt,
        });
        if (duplicates.length > 0) {
          // Ilgari bu yerda inline banner chizilib, funksiya QAYTIB ketardi:
          // xodim "Saqlash" ni bosib, keyin bannerdagi "Baribir saqlash" ni
          // bosardi — ikki qaror nuqtasi, ikki bosish. Endi bitta dialog va
          // javob shu yerda kutiladi.
          //
          // Tekshiruvning O'ZI o'zgarmadi: server tomondagi qattiq `dedupKey`
          // ham, ±1 kunlik yumshoq ogohlantirish ham o'z joyida.
          setManualBusy(false);
          const ok = await confirm({
            title: "Bu to'lov allaqachon kiritilganga o'xshaydi",
            description:
              `Shu firmadan bu summada ${duplicates.length} ta to'lov allaqachon qayd etilgan. ` +
              `Baribir saqlansinmi?`,
            confirmLabel: "Baribir saqlash",
            tone: "danger",
          });
          if (!ok) return;
          setManualBusy(true);
        }
      }

      await recordManualReceipt({
        companyId: manualCompanyId || null,
        contractId: manualContractId || null,
        channelId: type === "offset" ? null : manualChannelId,
        source: type,
        amount,
        receivedAt,
        docRef: manualDocRef.trim() || null,
        note: manualNote.trim() || null,
      });
      resetManual();
      onSaved();
    } catch (e) {
      setManualError(friendlyError(e) || "Yozib bo'lmadi");
    } finally {
      setManualBusy(false);
    }
  };
  /** Tanlangan firmaning shartnomalari — shartnoma tanlagichi shundan to'ladi. */
  const selectedContracts = useMemo(
    () => companies.find((c) => c.id === manualCompanyId)?.contracts ?? [],
    [companies, manualCompanyId]
  );
  return (
      <Modal
        open={type !== null}
        onClose={resetManual}
        dismissable={!manualBusy}
        size="lg"
        title={
          type === "naqd"
            ? "Naqd tushum qo'shish"
            : type === "plastik"
              ? "Plastik tushum qo'shish"
              : "Offset (vzaimozachyot) qo'shish"
        }
        description={
          type === "offset"
            ? "Pul hech qayerga tushmaydi — faqat tanlangan firmaning qarzini yopadi."
            : "Vipiskada ko'rinmaydigan tushum: pul qaysi kassaga kirganini ko'rsating."
        }
        footer={
          <>
            <Button type="button" variant="secondary" size="md" disabled={manualBusy} onClick={resetManual}>
              Bekor qilish
            </Button>
            <Button type="submit" form={MANUAL_FORM_ID} variant="primary" size="md" loading={manualBusy}>
              {manualBusy ? "Yozilmoqda…" : "Saqlash"}
            </Button>
          </>
        }
      >
        <form
          id={MANUAL_FORM_ID}
          onSubmit={(e) => { e.preventDefault(); void submitManual(); }}
          onKeyDown={submitOnCtrlEnter(() => void submitManual())}
          className="space-y-5"
        >
          {manualError && (
            <p
              className="text-meta p-3 rounded-lg"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              role="alert"
            >
              {manualError}
            </p>
          )}

          {/* ── ASOSIY ─────────────────────────────────────────────────── */}
          <FormSection title="Asosiy">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Sana" required>
                <DateField value={manualDate} onChange={setManualDate} />
              </Field>
              <Field label="Summa (so'm)" required>
                <MoneyField value={manualAmount} onChange={setManualAmount} placeholder="10 000 000" />
              </Field>
            </div>
            {type !== "offset" && (
              <Field
                label={type === "plastik" ? "Qaysi plastikka tushdi" : "Qaysi kassaga tushdi"}
                required
                hint="Manba majburiy: pul qaysi kassaga tushganini bilmasak, o'sha kassaning qoldig'i hech qachon to'g'ri chiqmaydi."
              >
                <FundingSourceSelect value={manualChannelId} onChange={setManualChannelId} />
              </Field>
            )}
          </FormSection>

          {/* ── KIMDAN ────────────────────────────────────────────────────
              Eng muhim bo'lim. Firma tanlansa to'lov mijozning qarzini
              kamaytiradi; tanlanmasa nomsiz tushum bo'lib qoladi. */}
          <FormSection title="Kimdan">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Firma" required={type === "offset"}>
                {/*
                  269 ta firma. Ilgari bu tekis `<select>` edi va native
                  klaviatura qidiruvi faqat NOM boshidan mos kelardi — STIR
                  bo'yicha qidirib bo'lmasdi. `CompanySelect` ikkalasini ham
                  qidiradi.
                */}
                <CompanySelect
                  companies={companies}
                  value={manualCompanyId}
                  onChange={(next) => {
                    setManualCompanyId(next);
                    setManualContractId("");
                  }}
                  placeholder="Firmani tanlang"
                  emptyLabel={
                    type === "offset" ? undefined : "Nomsiz tushum (firmaga bog'lanmagan)"
                  }
                />
              </Field>
              <Field label="Shartnoma">
                <Select
                  value={manualContractId}
                  onChange={(e) => setManualContractId(e.target.value)}
                  disabled={!manualCompanyId || selectedContracts.length === 0}
                  placeholder={
                    !manualCompanyId
                      ? "Avval firmani tanlang"
                      : selectedContracts.length === 0
                        ? "Shartnoma kiritilmagan"
                        : "Ko'rsatilmagan"
                  }
                >
                  {selectedContracts.map((ct) => (
                    <option key={ct.id} value={ct.id}>{ct.number}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {capNotice}
            {type !== "offset" && (
              manualCompanyId ? (
                <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                  Bu to&apos;lov tanlangan firmaning qarzini kamaytiradi.
                </p>
              ) : (
                <p className="text-micro" style={{ color: "var(--warning)" }}>
                  Firma tanlanmagan — tushum kassaga kiradi, lekin hech kimning qarzini kamaytirmaydi.
                </p>
              )
            )}
          </FormSection>

          {/* ── IZOH ──────────────────────────────────────────────────── */}
          <FormSection title="Izoh">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Chek / hujjat raqami">
                <input
                  className="erp-input w-full"
                  value={manualDocRef}
                  onChange={(e) => setManualDocRef(e.target.value)}
                  placeholder="ixtiyoriy"
                />
              </Field>
              <Field label="Izoh">
                <input
                  className="erp-input w-full"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="kimdan / nima uchun"
                />
              </Field>
            </div>
          </FormSection>
        </form>
      </Modal>
  );
}
