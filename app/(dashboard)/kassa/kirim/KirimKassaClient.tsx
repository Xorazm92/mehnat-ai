"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload, Link2, EyeOff, CreditCard, Wallet, Search, AlertTriangle, Plus,
  Banknote, CalendarDays, Landmark, Inbox,
} from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { todayKey, formatNum, formatUzDate, submitOnCtrlEnter } from "@/lib/platform/format";
import {
  Badge, DataTable, EmptyState, MetricRail, Modal, Money, PageHeader,
  type DataColumn,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { MoneyField } from "@/components/ui/MoneyField";
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
import { BreadcrumbTrail } from "@/components/BreadcrumbTrail";
import { sectionCrumbs, sectionMeta } from "@/lib/navigation";

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
  /**
   * Sahifa tepasidagi ko'rsatkichlar — QAT'IY davrlar (bugun / shu oy /
   * hozirgi qoldiq). Reyestrning o'z yig'indisi TANLANGAN davrga bo'ysunadi
   * va u boshqa komponent (`StatStrip`) bilan chiziladi: ilgari ikkala
   * to'plam ham bir xil kartochka bo'lgani uchun raqamlar ziddek ko'rinardi.
   */
  kpi: { todayIncome: number; monthIncome: number; balance: number };
  /** `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun). */
  initialTab?: KirimTab;
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

/**
 * Vipiska namunasi. Qatorlarning o'z id'si yo'q (ular hali bazaga yozilmagan),
 * shuning uchun oldindan ko'rish uchun tartib raqami qo'shiladi.
 */
type PreviewRow = StatementPreview["sample"][number] & { _i: number };

/**
 * Namuna ustunlari — SARALANMAYDI (`sortValue` berilmagan): bu vipiskaning
 * o'z tartibi va uni o'zgartirish faylni tekshirishni qiyinlashtiradi.
 */
const PREVIEW_COLUMNS: DataColumn<PreviewRow>[] = [
  { key: "date", header: "Sana", cell: (t) => formatUzDate(t.valueDate), width: "110px", mobile: "meta" },
  { key: "doc", header: "Hujjat", cell: (t) => t.docNumber ?? "—" },
  { key: "party", header: "Kontragent", cell: (t) => t.counterpartyName ?? "—", sticky: true, mobile: "title" },
  { key: "inn", header: "STIR", cell: (t) => t.counterpartyInn ?? "—" },
  { key: "contract", header: "Shartnoma", cell: (t) => t.contractHint ?? "—" },
  {
    key: "amount",
    header: "Summa",
    cell: (t) => <Money value={t.amount} tone={t.direction === "income" ? "in" : "out"} showSign bold />,
    numeric: true,
    align: "right",
  },
];

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

export default function KirimKassaClient({ accounts, unmatched, companies, kpi, initialTab = "reyestr" }: Props) {
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
  // Sarlavha/ikonka joriy bo'limdan — yon panel bilan bir manba.
  const meta = sectionMeta("/kassa/kirim", tab);
  const SectionIcon = meta?.icon ?? Banknote;
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

  const resetManual = () => {
    setManualType(null);
    setManualAmount(null);
    setManualNote("");
    setManualChannelId("");
    setManualCompanyId("");
    setManualContractId("");
    setManualDocRef("");
  };

  const submitManual = async (opts?: { force?: boolean }) => {
    if (!manualType) return;
    // `MoneyField` tashqariga har doim SON beradi (ajratkich faqat ko'rinishda).
    const amount = manualAmount ?? 0;
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
      <BreadcrumbTrail crumbs={sectionCrumbs("/kassa/kirim", tab)} />
      <PageHeader
        title={meta?.label ?? "Kirim kassa"}
        description={meta?.description ?? "Bank vipiskasi, plastik karta va naqd pul kirimlari"}
        icon={<SectionIcon size={20} />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
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
        }
      />

      {/*
        QAT'IY DAVRLI KO'RSATKICHLAR.

        Ilgari bu yerda "shu oy" bo'yicha uchta karta turardi, reyestr ustida
        esa yana to'rtta — lekin ular TANLANGAN davrga bo'ysunardi. Ikki
        to'plam bir xil ko'rinar, boshqa davrni ko'rsatar va qaysi biri
        "haqiqiy" ekani ekrandan bilinmasdi.

        Endi ular AJRATILGAN: bu yerdagi plitkalar har doim bugun/shu oy/
        qoldiqni beradi va yorlig'i davrni AYTADI; reyestrning yig'indisi esa
        jadval ustida, filtr bilan bir joyda, boshqa ko'rinishda turadi.
      */}
      {/* `KpiCard` gridi o'rniga `MetricRail`: to'rtta TO'LIQ BO'YALGAN quti
          (yashil, ko'k, oq, sariq) yonma-yon turganda ekran gradient panelga
          o'xshab qolardi va ko'z avval rangni, keyin raqamni o'qirdi. Bu
          to'rt raqam esa bir o'lchovning kesimlari — bitta panel, ichida
          soch-chiziq, ton faqat tepadagi 2px chiziqda. */}
      <MetricRail
        columns={4}
        items={[
          {
            label: "Bugungi kirim",
            value: formatNum(kpi.todayIncome),
            unit: "so'm",
            hint: "bugun",
            icon: <CalendarDays size={13} />,
            tone: kpi.todayIncome > 0 ? "success" : "neutral",
          },
          {
            label: "Shu oy kirimi",
            value: formatNum(kpi.monthIncome),
            unit: "so'm",
            hint: "joriy oy",
            icon: <Wallet size={13} />,
            tone: "brand",
            emphasis: true,
          },
          {
            label: "Hozirgi qoldiq",
            value: formatNum(kpi.balance),
            unit: "so'm",
            hint: "kassa va hisoblarda",
            icon: <Landmark size={13} />,
            tone: kpi.balance < 0 ? "danger" : "neutral",
          },
          {
            label: "Bog'lash kerak",
            value: totalUnmatched,
            unit: "ta",
            hint: totalUnmatched > 0 ? "qaysi firmadan ekani aniqlanmagan" : "hammasi bog'langan",
            icon: <Link2 size={13} />,
            tone: totalUnmatched > 0 ? "warning" : "neutral",
            href: totalUnmatched > 0 ? "/kassa/kirim?tab=navbat" : undefined,
          },
        ]}
      />

      <Tabs
        items={[
          { id: "reyestr", label: "Barcha tushum", hint: "Bank, plastik va naqd — bitta ro'yxatda" },
          { id: "hisoblar", label: "Firma hisoblari", hint: "O'z firmalarimiz bo'yicha bank kirimi" },
          { id: "navbat", label: "Bog'lash kerak", hint: "Qaysi firmadan ekani hali aniqlanmagan kirimlar", count: totalUnmatched || undefined },
        ] as TabItem<KirimTab>[]}
        value={tab}
        onChange={setTab}
        ariaLabel="Kirim kassa bo'limlari"
        // FAQAT TELEFONDA: kompyuterda bu ro'yxat yon panelda uchinchi daraja
        // bo'lib turibdi (`NAV_SECTIONS`) — bir xil tanlov ekranda ikki marta
        // ko'rinardi. Telefonda yon panel gamburger ortida yashirin.
        className="md:hidden"
      />

      {/*
        QO'LDA KIRIM — MODALDA.

        Ilgari forma sahifa oqimida ochilib, tablar bilan reyestrni pastga
        surib yuborardi va uni ko'rinadigan joyga `scrollIntoView` bilan
        majburan surish kerak bo'lardi. Endi u dialog: fokus tuzog'i, Escape
        va fokusni qaytarish `Modal` ning xossasi.

        Forma `<form onSubmit>` bo'lib qoladi (Enter saqlaydi) va Ctrl+Enter
        ham ishlaydi — kassir kunda o'nlab yozuv kiritadi.
      */}
      <Modal
        open={manualType !== null}
        onClose={resetManual}
        dismissable={!manualBusy}
        size="lg"
        title={
          manualType === "naqd"
            ? "Naqd tushum qo'shish"
            : manualType === "plastik"
              ? "Plastik tushum qo'shish"
              : "Offset (vzaimozachyot) qo'shish"
        }
        description={
          manualType === "offset"
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
            {manualType !== "offset" && (
              <Field
                label={manualType === "plastik" ? "Qaysi plastikka tushdi" : "Qaysi kassaga tushdi"}
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
              <Field label="Firma" required={manualType === "offset"}>
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
                    manualType === "offset" ? undefined : "Nomsiz tushum (firmaga bog'lanmagan)"
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
            {manualType !== "offset" && (
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

              <DataTable
                rows={preview.sample.map((t, i) => ({ ...t, _i: i }))}
                columns={PREVIEW_COLUMNS}
                rowKey={(t) => String(t._i)}
                caption="Vipiskadan namuna qatorlar"
                maxBodyHeight={null}
                density="compact"
              />

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
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom, STIR yoki shartnoma"
              aria-label="Moslashtirilmagan kirimlar ichidan qidirish"
              className="erp-input pl-8"
            />
          </div>
        </div>

        {filteredUnmatched.length === 0 ? (
          <div className="rounded-xl" style={card}>
            <EmptyState
              icon={<Inbox size={28} />}
              title={search.trim() ? "Qidiruvga mos kirim topilmadi" : "Moslashtirilmagan kirim yo'q"}
              description={
                search.trim()
                  ? "Boshqa nom, STIR yoki shartnoma raqamini kiriting."
                  : "Vipiskadagi barcha kirimlar firmalarga bog'langan."
              }
              action={
                search.trim() ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearch("")}>
                    Qidiruvni tozalash
                  </Button>
                ) : undefined
              }
            />
          </div>
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
            {tx.contractHint && <Badge tone="info">{tx.contractHint}</Badge>}
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
              aria-label="Kimga / nima uchun"
              value={expNote}
              onChange={(e) => setExpNote(e.target.value)}
              disabled={busy}
              className="erp-input min-w-0"
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
