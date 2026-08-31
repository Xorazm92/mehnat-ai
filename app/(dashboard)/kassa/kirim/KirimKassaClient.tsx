"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Link2, EyeOff, CreditCard, Wallet, Search, AlertTriangle, Plus } from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { groupDigits, ungroupDigits, todayKey, formatNum, formatUzDate } from "@/lib/platform/format";
import { Money } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import {
  previewStatement,
  commitStatementUpload,
  matchAndPostTransaction,
  ignoreTransaction,
  recordManualReceipt,
  checkDuplicateReceipt,
  postExpenseFromBankTransaction,
} from "@/server/bankImport";
import type { StatementPreview } from "@/lib/bank/types";
import FundingSourceSelect from "@/components/ui/FundingSourceSelect";
import { getServiceTermInfo } from "@/server/companies";
import IncomeRegister from "./IncomeRegister";
import { Tabs, type TabItem } from "@/components/ui";
import { friendlyError } from "@/lib/actionError";
import { DateField } from "@/components/ui/DateField";
import { CompanySelect } from "@/components/ui/CompanySelect";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useTabParam } from "@/hooks/useTabParam";
import { KIRIM_TAB_IDS, type KirimTab } from "@/lib/kirimTabs";

interface AccountRow {
  id: string;
  accountNumber: string;
  label: string;
  inn: string;
  ownerCompany: { id: string; name: string } | null;
  monthIncome: number;
  monthCount: number;
  unmatchedCount: number;
  lastImportAt: string | null;
  lastImportFile: string | null;
  lastPeriodIncome: number;
  lastPeriodCount: number;
  lastPeriodTo: string | null;
}

interface UnmatchedRow {
  id: string;
  valueDate: string;
  docNumber: string | null;
  amount: string | number;
  counterpartyInn: string | null;
  counterpartyName: string | null;
  contractHint: string | null;
  purpose: string | null;
  account: { label: string };
}

interface CompanyOption {
  id: string;
  name: string;
  inn: string;
  contracts: { id: string; number: string }[];
}

interface Props {
  accounts: AccountRow[];
  unmatched: UnmatchedRow[];
  companies: CompanyOption[];
  /** `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun). */
  initialTab?: KirimTab;
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

export default function KirimKassaClient({ accounts, unmatched, companies, initialTab = "reyestr" }: Props) {
  const router = useRouter();

  // TABLAR. Sahifada 10 ta firma kartochkasi, 133 qatorli reyestr va
  // moslashtirilmaganlar navbati bir vertikalda edi — kundalik ish
  // (reyestr) uchun har safar pastga aylantirish kerak bo'lardi.
  // Yorliq URL'da: F5 bosilganda holat saqlanadi va "muddati kelgan
  // bog'lanmaganlarga qara" deb havola yuborish mumkin
  // (`/kassa/kirim?tab=navbat`). Ilgari bu oddiy `useState` edi — bank
  // xodimi kechqurun navbatni ochib, sahifani yangilasa reyestrga
  // qaytib tushardi.
  const [tab, setTab] = useTabParam<KirimTab>("tab", KIRIM_TAB_IDS, initialTab);
  useAutoRefresh();

  // `IncomeRegister` o'z ma'lumotini MUSTAQIL o'qiydi (server action, props
  // orqali emas) — shuning uchun `router.refresh()` uni yangilamaydi: yangi
  // tushum yozilgach yuqoridagi kartochkalar (server prop) yangilanadi,
  // pastdagi reyestr esa ESKI holatda qolib, ikkita raqam bir sahifada
  // ziddiyatga kirardi. `refreshTick` — mutatsiyadan keyin oshadigan
  // hisoblagich; `IncomeRegister` uni effekt qaramligiga qo'shib qayta so'raydi.
  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRegister = () => setRefreshTick((v) => v + 1);

  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  /** Serverdan kelgan tushunarli xato — prod'da toast matni umumiy bo'lib qoladi. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Qo'lda kirim: naqd va plastik pul vipiskada ko'rinmaydi, uni odam
  // kiritadi. Backend (createKassaEntry) bor edi, ekran yo'q edi.
  //
  // "offset" — vzaimozachyot/ijara: pul HECH QAYERGA tushmaydi (kanal
  // so'ralmaydi), lekin mijozning qarzini yopadi. CompanyServiceTerm.offsetAmount
  // dan belgilangan oylik limitdan oshirib bo'lmaydi (server tekshiradi).
  const [manualType, setManualType] = useState<"naqd" | "plastik" | "offset" | null>(null);
  // KIMDAN tushdi. Bu maydon yo'q edi va aynan shu sababli qo'lda kiritilgan
  // naqd to'lov mijozning qarzini kamaytirmasdi — yozuv hech kimga
  // bog'lanmagan `KassaEntry` bo'lib qolardi.
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualContractId, setManualContractId] = useState("");
  const [manualDocRef, setManualDocRef] = useState("");
  /** Takroriylik ogohlantirishi — foydalanuvchi tasdiqlagach saqlanadi. */
  const [manualAmount, setManualAmount] = useState("");
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
    if (!manualType || !manualCompanyId) {
      setSourceCap(null);
      return;
    }
    const type = manualType;
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
  }, [manualType, manualCompanyId]);

  const capLabel = manualType === "offset" ? "offset" : manualType === "plastik" ? "plastik" : "naqd";
  const capNotice = manualCompanyId && sourceCap && (
    <p className="text-micro" style={{ color: sourceCap.used >= sourceCap.cap ? "var(--danger)" : "var(--text-muted)" }}>
      Shu oy uchun {capLabel} limiti: {formatNum(sourceCap.cap)} so&apos;m,
      ishlatilgan: {formatNum(sourceCap.used)} so&apos;m,
      qoldi: {formatNum(Math.max(0, sourceCap.cap - sourceCap.used))} so&apos;m.
      {sourceCap.cap === 0 && " (Bu firmada offset split belgilanmagan — \"Narxni o'zgartirish\" orqali sozlang.)"}
    </p>
  );

  // Tushum formasi ochilganda ko'rinadigan joyga suring — ilgari u sahifa
  // o'rtasida paydo bo'lib, foydalanuvchi uni qidirib topishi kerak edi.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (manualType) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [manualType]);

  const resetManual = () => {
    setManualType(null);
    setManualAmount("");
    setManualNote("");
    setManualChannelId("");
    setManualCompanyId("");
    setManualContractId("");
    setManualDocRef("");
  };

  const submitManual = async (opts?: { force?: boolean }) => {
    if (!manualType) return;
    // Kirishda probellar bilan guruhlangan ("1 500 000") — yechib olinadi.
    const amount = Number(ungroupDigits(manualAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError("Summa musbat son bo'lishi kerak");
      return;
    }
    if (manualType === "offset") {
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
        manualType === "plastik"
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
        channelId: manualType === "offset" ? null : manualChannelId,
        source: manualType,
        amount,
        receivedAt,
        docRef: manualDocRef.trim() || null,
        note: manualNote.trim() || null,
      });
      resetManual();
      router.refresh();
      bumpRegister();
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

  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  // EKRANDA BITTA RAQAM QATORI QOLDI.
  //
  // Ilgari tepada "shu oy" bo'yicha uchta karta (bank / plastik / naqd)
  // turardi, reyestr ustida esa yana to'rtta karta — lekin ular TANLANGAN
  // DAVRGA bo'ysunardi. Ikki to'plam bir xil ko'rinar, boshqa davrni
  // ko'rsatar va raqamlari mos kelmasdi; qaysi biri "haqiqiy" ekani
  // ekrandan bilinmasdi. Endi faqat reyestr kartalari qoldi — ular davr
  // chiplariga bo'ysunadi, ya'ni ekranda ko'rilayotgan raqam har doim
  // ko'rilayotgan ro'yxatning raqami.
  const totalUnmatched = accounts.reduce((s, a) => s + a.unmatchedCount, 0);

  const filteredUnmatched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unmatched;
    return unmatched.filter(
      (u) =>
        (u.counterpartyName ?? "").toLowerCase().includes(q) ||
        (u.counterpartyInn ?? "").includes(q) ||
        (u.contractHint ?? "").toLowerCase().includes(q)
    );
  }, [unmatched, search]);

  const reset = () => {
    setPreview(null);
    setPendingFile(null);
    setUploadError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onPick = async (file: File) => {
    setBusy(true);
    setPendingFile(file);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewStatement(fd);
      if (res.ok) {
        setPreview(res.data);
      } else {
        // Server action XATO OTSA, prod'da matn brauzerga yetmaydi (Next.js
        // uni yashiradi). Shuning uchun kutilgan xatolar natija sifatida
        // qaytariladi va aynan shu yerda ko'rsatiladi.
        setPreview(null);
        setUploadError(res.error);
      }
    } catch (e) {
      setPreview(null);
      setUploadError(
        friendlyError(e) || "Faylni o'qib bo'lmadi. Fayl turini tekshiring (.xlsx / .xls)."
      );
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await commitStatementUpload(fd);
      if (!res.ok) {
        setUploadError(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        `${d.account}: ${d.rowsInserted} ta yozildi` +
          (d.rowsDuplicate > 0 ? `, ${d.rowsDuplicate} ta dublikat tashlandi` : "") +
          (d.posted > 0
            ? ` · ${d.posted} ta hisobga olindi (${formatNum(d.postedAmount)} so'm)`
            : d.matched > 0
              ? " · moslashtirildi"
              : "") +
          (d.stillUnmatched > 0 ? ` · ${d.stillUnmatched} tasi qo'lda hal qilinadi` : "")
      );
      if (d.postErrors.length > 0) {
        toast.warning(`${d.postErrors.length} ta qator hisobga olinmadi`, {
          description: d.postErrors.join("\n"),
        });
      }
      reset();
      router.refresh();
      bumpRegister();
    } catch (e) {
      setUploadError(friendlyError(e) || "Yuklashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            Kirim kassa
          </h1>
          <p className="text-meta" style={{ color: "var(--text-muted)" }}>
            Bank vipiskasi, plastik karta va naqd pul kirimlari
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/*
            TUR ENDI TUGMANING O'ZIDA.

            Ilgari bu bitta "Tushum qo'shish" tugmasi edi va u har doim
            NAQD formasini ochardi — yorlig'i esa turni aytmasdi. Plastik
            tushum qo'shishning yagona yo'li pastdagi stat kartani bosish
            edi; o'sha karta `<button>` ichida yana `role="button"` saqlab
            turardi (HTML jihatdan noto'g'ri, klaviatura uchun buzilgan).

            Alisher kunda NAQD ham, PLASTIK ham kiritadi — ikkalasi ham
            bir bosishda bo'lishi kerak, shuning uchun ikkitasi ham asosiy
            amal sifatida turadi.
          */}
          <Button
            variant="primary"
            size="md"
            icon={<Wallet size={15} />}
            onClick={() => { setManualType("naqd"); setManualError(null); }}
          >
            Naqd
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<CreditCard size={15} />}
            onClick={() => { setManualType("plastik"); setManualError(null); }}
          >
            Plastik
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => { setManualType("offset"); setManualError(null); }}
            title="Vzaimozachyot/ijara — pul kassaga tushmaydi, faqat qarzni yopadi"
          >
            <Plus size={15} /> Offset
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
            }}
          />
          <Button variant="secondary" size="md" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> Vipiska yuklash
          </Button>
        </div>
      </div>

      <Tabs
        items={[
          { id: "reyestr", label: "Barcha tushum", hint: "Bank, plastik va naqd — bitta ro'yxatda" },
          { id: "hisoblar", label: "Firma hisoblari", hint: "O'z firmalarimiz bo'yicha bank kirimi" },
          { id: "navbat", label: "Bog'lash kerak", hint: "Qaysi firmadan ekani hali aniqlanmagan kirimlar", count: totalUnmatched || undefined },
        ] as TabItem<KirimTab>[]}
        value={tab}
        onChange={setTab}
        ariaLabel="Kirim kassa bo'limlari"
      />

      {/* Qo'lda kirim formasi */}
      {manualType && (
        // ILGARI bu oddiy `<div>` edi: butun kassa modulida bitta ham
        // `<form onSubmit>` yo'q edi (`grep -c onSubmit` → 0), ya'ni Enter
        // hech qayerda saqlamasdi. Alisher kunda o'nlab yozuv kiritadi —
        // har safar sichqonchaga qo'l uzatish shu yerda tugadi.
        <form
          ref={formRef}
          onSubmit={(e) => { e.preventDefault(); void submitManual(); }}
          className="p-4 rounded-xl space-y-3"
          style={{ ...card, borderColor: "var(--accent-blue)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              {manualType === "naqd" ? "Naqd tushum" : manualType === "plastik" ? "Plastik tushum" : "Offset (vzaimozachyot)"} qo&apos;shish
            </h2>
            <Button type="button" variant="secondary" size="sm" onClick={resetManual}>Yopish</Button>
          </div>
          {manualError && (
            <p className="text-meta" style={{ color: "var(--danger)" }}>{manualError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Sana</span>
              <DateField
                className="mt-1"
                inputClassName="w-full px-3 py-2 rounded-lg text-meta outline-none"
                inputStyle={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualDate}
                onChange={setManualDate}
              />
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Summa (so&apos;m)</span>
              <input
                inputMode="numeric"
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta text-right tabular-nums outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualAmount}
                onChange={(e) => setManualAmount(groupDigits(e.target.value))}
                placeholder="10 000 000"
              />
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Izoh</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="kimdan / nima uchun"
              />
            </label>
          </div>
          {/* KIMDAN — eng muhim maydon. Firma tanlansa to'lov mijozning
              qarzini kamaytiradi; tanlanmasa nomsiz tushum bo'lib qoladi. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Kimdan (firma)</span>
              {/*
                269 ta firma. Ilgari bu tekis `<select>` edi va native
                klaviatura qidiruvi faqat NOM boshidan mos kelardi — STIR
                bo'yicha qidirib bo'lmasdi. `CompanySelect` ikkalasini ham
                qidiradi.
              */}
              <CompanySelect
                className="mt-1"
                companies={companies}
                value={manualCompanyId}
                onChange={(next) => {
                  setManualCompanyId(next);
                  setManualContractId("");
                              }}
                placeholder="Firmani tanlang"
                emptyLabel={
                  manualType === "offset" ? undefined : "Nomsiz tushum (firmaga bog'lanmagan)"
                }
              />
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Shartnoma</span>
              <Select
                className="mt-1"
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
            </label>
            <label className="block">
              <span className="text-meta" style={{ color: "var(--text-secondary)" }}>Chek / hujjat raqami</span>
              <input
                className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
                style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                value={manualDocRef}
                onChange={(e) => setManualDocRef(e.target.value)}
                placeholder="ixtiyoriy"
              />
            </label>
          </div>
          {manualType === "offset" ? (
            <>
              <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                Offset — pul HECH QAYERGA tushmaydi (kanal so&apos;ralmaydi), faqat tanlangan firmaning
                qarzini yopadi. Kassa balansiga ta&apos;sir qilmaydi.
              </p>
              {capNotice}
            </>
          ) : (
            <>
              {capNotice}
              <label className="block">
                <span className="text-meta" style={{ color: "var(--text-secondary)" }}>
                  {manualType === "plastik" ? "Qaysi plastikka tushdi" : "Qaysi kassaga tushdi"}{" "}
                  <span style={{ color: "var(--danger)" }}>*</span>
                </span>
                <FundingSourceSelect
                  value={manualChannelId}
                  onChange={setManualChannelId}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-meta outline-none"
                />
              </label>
              {manualCompanyId ? (
                <p className="text-micro" style={{ color: "var(--text-muted)" }}>
                  Bu to&apos;lov tanlangan firmaning qarzini kamaytiradi.
                </p>
              ) : (
                <p className="text-micro" style={{ color: "var(--warning, var(--text-muted))" }}>
                  Firma tanlanmagan — tushum kassaga kiradi, lekin hech kimning qarzini kamaytirmaydi.
                </p>
              )}
            </>
          )}
          {/* `type="submit"` — forma `onSubmit` ga ulangan, ya'ni istalgan
              maydonda Enter ham shu tugmani bosgan bilan barobar. */}
          <Button type="submit" variant="primary" size="md" loading={manualBusy}>
            {manualBusy ? "Yozilmoqda…" : "Saqlash"}
          </Button>
        </form>
      )}

      {/* Xato paneli — toast emas, chunki matn uzun va o'qilishi kerak */}
      {uploadError && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}
        >
          <AlertTriangle size={18} style={{ color: "var(--danger)" }} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold" style={{ color: "var(--danger)" }}>
              Faylni yuklab bo'lmadi
            </div>
            <p className="text-meta mt-1 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
              {uploadError}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={reset}>
            Yopish
          </Button>
        </div>
      )}

      {/* Oldindan ko'rish */}
      {preview && (
        <div className="p-5 rounded-xl space-y-3" style={{ ...card, borderColor: "var(--accent-blue)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
              Oldindan ko&apos;rish — {preview.accountLabel ?? "noma'lum hisob"}
            </h2>
            <span className="text-meta" style={{ color: "var(--text-muted)" }}>
              format: {preview.format}
              {preview.periodFrom && preview.periodTo
                ? ` · ${formatUzDate(preview.periodFrom)} — ${formatUzDate(preview.periodTo)}`
                : ""}
            </span>
          </div>

          {preview.unknownAccount ? (
            /* IKKI XIL MUAMMO, ikki xil xabar. Ilgari ikkalasi ham "hisob
               bazada yo'q" derdi va foydalanuvchi mavjud hisobni qayta
               qo'shishga urinardi, holbuki muammo faylni o'qishda edi. */
            <div className="space-y-1">
              {preview.accountNumber ? (
                <>
                  <p className="text-body" style={{ color: "var(--danger)" }}>
                    Hisob raqami {preview.accountNumber} bazada ro&apos;yxatdan o&apos;tmagan.
                  </p>
                  <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
                    Yuklash uchun avval shu hisobni o&apos;z firmalar ro&apos;yxatiga qo&apos;shing.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-body" style={{ color: "var(--danger)" }}>
                    Hisob raqami FAYLDAN o&apos;qib bo&apos;lmadi — muammo bazada emas, vipiska
                    sarlavhasida.
                  </p>
                  <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
                    Sarlavhada &quot;Cчет: &lt;20 raqam&gt;&quot; qatori bormi, tekshiring. Faylni
                    o&apos;zgartirmasdan yuboring — parser shu ko&apos;rinishga moslanadi.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-meta">
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Kirim</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                    {preview.incomeCount} ta · {formatNum(preview.incomeSum)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Chiqim</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--danger)" }}>
                    {preview.expenseCount} ta · {formatNum(preview.expenseSum)}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Dublikat</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                    {preview.duplicateCount} ta
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Yangi yoziladi</div>
                  <div className="font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                    {preview.incomeCount + preview.expenseCount - preview.duplicateCount} ta
                  </div>
                </div>
              </div>

              {preview.warnings && preview.warnings.length > 0 && (
                <div
                  className="p-3 rounded-lg space-y-1"
                  style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}
                >
                  <div className="text-meta font-semibold" style={{ color: "var(--warning)" }}>
                    Tekshirish kerak
                  </div>
                  {preview.warnings.map((w, i) => (
                    <p key={i} className="text-meta" style={{ color: "var(--text-secondary)" }}>{w}</p>
                  ))}
                </div>
              )}

              {preview.duplicateCount > 0 && (
                <p className="text-meta" style={{ color: "var(--warning)" }}>
                  Bu faylning {preview.duplicateCount} ta qatori allaqachon bazada bor — ular qayta
                  yozilmaydi.
                </p>
              )}

              <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--card-border)" }}>
                <table className="w-full text-meta">
                  <thead>
                    <tr style={{ background: "var(--input-bg)" }}>
                      <th className="text-left p-2">Sana</th>
                      <th className="text-left p-2">Hujjat</th>
                      <th className="text-left p-2">Kontragent</th>
                      <th className="text-left p-2">STIR</th>
                      <th className="text-left p-2">Shartnoma</th>
                      <th className="text-right p-2">Summa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((t, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--card-border)" }}>
                        <td className="p-2 whitespace-nowrap">{formatUzDate(t.valueDate)}</td>
                        <td className="p-2">{t.docNumber ?? "—"}</td>
                        <td className="p-2 max-w-[240px] truncate">{t.counterpartyName ?? "—"}</td>
                        <td className="p-2">{t.counterpartyInn ?? "—"}</td>
                        <td className="p-2">{t.contractHint ?? "—"}</td>
                        <td
                          className="p-2 text-right tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: t.direction === "income" ? "var(--success)" : "var(--danger)" }}
                        >
                          {t.direction === "income" ? "+" : "−"}
                          {formatNum(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="primary" size="md" disabled={busy} onClick={onConfirm}>
                  Tasdiqlash va yuklash
                </Button>
                <Button variant="secondary" size="md" disabled={busy} onClick={reset}>
                  Bekor qilish
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "hisoblar" && (<>
      {/* O'z firmalar hisoblari */}
      <div className="space-y-2">
        <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
          Firma hisoblari ({accounts.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="p-4 rounded-xl" style={card}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate" style={{ color: "var(--text)" }}>
                    {a.label}
                  </div>
                  <div className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {a.accountNumber}
                  </div>
                </div>
                {a.unmatchedCount > 0 && (
                  <span
                    className="text-micro font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                  >
                    {a.unmatchedCount} ta
                  </span>
                )}
              </div>
              {a.monthCount > 0 || !a.lastPeriodTo ? (
                <>
                  <div className="mt-3 text-lg font-semibold tabular-nums" style={{ color: "var(--success)" }}>
                    {formatNum(a.monthIncome)} <span className="text-meta">so&apos;m</span>
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    shu oyda {a.monthCount} ta kirim
                    {a.lastImportAt
                      ? ` · oxirgi vipiska ${formatUzDate(a.lastImportAt)}`
                      : " · vipiska yuklanmagan"}
                  </div>
                </>
              ) : (
                <>
                  {/* Joriy oyda hali vipiska yo'q — oxirgi davr raqamini
                      ko'rsatamiz, lekin QAYSI davr ekanini aniq yozib. */}
                  <div className="mt-3 text-lg font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {formatNum(a.lastPeriodIncome)} <span className="text-meta">so&apos;m</span>
                  </div>
                  <div className="text-micro" style={{ color: "var(--warning)" }}>
                    {formatUzDate(a.lastPeriodTo)} davri · {a.lastPeriodCount} ta kirim
                  </div>
                  <div className="text-micro" style={{ color: "var(--text-muted)" }}>
                    shu oyda vipiska yuklanmagan
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      </>)}

      {tab === "reyestr" && (<>
      {/* Kirim reyestri — barcha tushum (bank ham) bitta jadvalda, sana
          oralig'i bilan. Bu blok ilgari faqat "Plastik va naqd tushumlari"
          edi: bank tushumi ko'rinmasdi va sana filtri yo'q edi. */}
      <IncomeRegister companies={companies} refreshKey={refreshTick} />

      </>)}

      {tab === "navbat" && (<>
      {/* Moslashtirilmaganlar navbati */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-body font-semibold" style={{ color: "var(--text)" }}>
            Moslashtirilmagan kirimlar ({totalUnmatched})
          </h2>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, STIR yoki shartnoma"
              className="pl-8 pr-3 py-1.5 rounded-lg text-meta outline-none"
              style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            />
          </div>
        </div>

        {filteredUnmatched.length === 0 ? (
          <p className="p-4 rounded-xl text-meta" style={{ ...card, color: "var(--text-muted)" }}>
            Moslashtirilmagan kirim yo&apos;q.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredUnmatched.map((tx) => (
              <UnmatchedCard
                key={tx.id}
                tx={tx}
                companies={companies}
                onDone={() => { router.refresh(); bumpRegister(); }}
              />
            ))}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

/** Bitta moslashtirilmagan tranzaksiya — firma tanlab hisobga olinadi. */
function UnmatchedCard({
  tx,
  companies,
  onDone,
}: {
  tx: UnmatchedRow;
  companies: CompanyOption[];
  onDone: () => void;
}) {
  const [companyId, setCompanyId] = useState("");
  const [contractId, setContractId] = useState("");
  const [busy, setBusy] = useState(false);
  // "BU CHIQIM" rejimi — qator haqiqatda chiqim bo'lsa (xodimga oylik,
  // firmalararo yordam…). Ilgari bunday qatorni yopib bo'lmagan va u
  // navbatda abadiy turardi.
  const [expenseMode, setExpenseMode] = useState(false);
  const [expCategory, setExpCategory] = useState("oylik");
  const [expNote, setExpNote] = useState("");

  // STIR bo'yicha taklif — ko'pincha firma bazada bor, lekin STIR biroz
  // boshqacha yozilgan yoki bir nechta firma mos kelgan.
  const suggested = useMemo(
    () => (tx.counterpartyInn ? companies.filter((c) => c.inn === tx.counterpartyInn) : []),
    [companies, tx.counterpartyInn]
  );
  const selected = companies.find((c) => c.id === companyId);

  const post = async () => {
    if (!companyId) {
      toast.error("Avval firmani tanlang");
      return;
    }
    setBusy(true);
    try {
      await matchAndPostTransaction({
        transactionId: tx.id,
        companyId,
        contractId: contractId || null,
      });
      toast.success("Kirim hisobga olindi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const saveAsExpense = async (isSalary: boolean) => {
    setBusy(true);
    try {
      await postExpenseFromBankTransaction({
        transactionId: tx.id,
        category: isSalary ? "Oylik" : expCategory,
        description: expNote.trim() || tx.counterpartyName || null,
        isSalary,
      });
      toast.success(isSalary ? "Oylik chiqimi yozildi" : "Chiqim yozildi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await ignoreTransaction(tx.id, "Mijoz to'lovi emas");
      toast.success("E'tiborsiz qoldirildi");
      onDone();
    } catch (e) {
      toast.error(friendlyError(e) || "Xatolik");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl" style={card}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {tx.counterpartyName ?? "Nomsiz"}
            </span>
            {tx.counterpartyInn && (
              <span className="text-micro tabular-nums" style={{ color: "var(--text-muted)" }}>
                STIR {tx.counterpartyInn}
              </span>
            )}
            {tx.contractHint && (
              <span
                className="text-micro font-semibold px-1.5 py-0.5 rounded"
                style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}
              >
                {tx.contractHint}
              </span>
            )}
          </div>
          <div className="text-micro mt-0.5" style={{ color: "var(--text-muted)" }}>
            {formatUzDate(tx.valueDate)} · {tx.account.label}
            {tx.docNumber ? ` · hujjat ${tx.docNumber}` : ""}
          </div>
          {tx.purpose && (
            <div className="text-micro mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
              {tx.purpose}
            </div>
          )}
        </div>
        <div className="text-lg font-semibold tabular-nums whitespace-nowrap">
          <Money value={Number(tx.amount)} tone="in" showSign bold />
        </div>
      </div>

      {expenseMode ? (
        /* ── CHIQIM REJIMI ─────────────────────────────────────────────── */
        <div className="mt-3 p-3 rounded-lg space-y-2" style={{ background: "var(--input-bg)", border: "1px solid var(--card-border)" }}>
          <p className="text-meta" style={{ color: "var(--text-secondary)" }}>
            Bu pul MIJOZ to&apos;lovi emas — xarajat sifatida yoziladi (kassadan chiqdi).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
            <Select
              size="sm"
              fullWidth={false}
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              disabled={busy}
              aria-label="Xarajat toifasi"
            >
              <option value="oylik">Oylik / maosh</option>
              <option value="Moliyaviy yordam">Moliyaviy yordam</option>
              <option value="Qarz">Qarz berish</option>
              <option value="Ijara">Ijara</option>
              <option value="Aloqa">Aloqa</option>
              <option value="Ovqatga">Ovqat</option>
              <option value="Texnika">Texnika</option>
              <option value="Boshqa xarajatlar">Boshqa</option>
            </Select>
            <input
              placeholder="Kimga / nima uchun (ixtiyoriy)"
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-meta outline-none min-w-0"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text)" }}
            />
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void saveAsExpense(expCategory === "oylik")}>
              Yozish
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setExpenseMode(false)}>
              Orqaga
            </Button>
          </div>
        </div>
      ) : (
        <>
          {suggested.length === 1 && companyId !== suggested[0].id && (
            <div className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => { setCompanyId(suggested[0].id); setContractId(""); }}
              >
                <Link2 size={12} /> {suggested[0].name} — STIR mos
              </Button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-center">
            <div className="flex gap-2">
              {/*
                Taklif ro'yxat ICHIDA `optgroup` bo'lib turardi: tizim javobni
                bilardi, lekin uni ko'rish uchun 269 talik ro'yxatni ochish
                kerak edi. Bank xodimi kechqurun o'nlab qatorni biriktiradi —
                shuning uchun BITTA aniq taklif endi bosiladigan chip.
              */}
              <CompanySelect
                className="flex-1 min-w-0"
                size="sm"
                companies={companies}
                value={companyId}
                onChange={(next) => {
                  setCompanyId(next);
                  setContractId("");
                }}
                suggestions={suggested.map((c) => c.id)}
                placeholder="Firmani tanlang…"
              />

              {selected && selected.contracts.length > 0 && (
                <Select
                  size="sm"
                  fullWidth={false}
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value)}
                  placeholder="Shartnomasiz"
                  aria-label="Shartnoma"
                >
                  {selected.contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <Button variant="primary" size="sm" disabled={busy || !companyId} onClick={post}>
              <Link2 size={14} /> Hisobga olish
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={skip}>
              <EyeOff size={14} /> E&apos;tiborsiz
            </Button>
          </div>

          {/* QATOR HAQIQATDA KIRIM EMASMI? — oylik o'tkazmalari kabi.
              Buni yopishning yagona yo'li ilgari navbatni to'ldirib qo'yardi. */}
          <button
            type="button"
            onClick={() => setExpenseMode(true)}
            disabled={busy}
            className="mt-2 text-micro underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            Bu mijoz to&apos;lovi emas — chiqim sifatida yozish (oylik, yordam…) →
          </button>
        </>
      )}
    </div>
  );
}
