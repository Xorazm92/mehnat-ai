"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Link2, CreditCard, Wallet, Plus, Banknote, CalendarDays, Landmark, } from "lucide-react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { formatNum, formatUzDate } from "@/lib/platform/format";
import {
  MetricRail, PageHeader,
} from "@/components/ui";
import { Button } from "@/components/ui/Button";
import {
} from "@/server/bank/post";
import type { UnallocatedIncomeReport } from "@/server/debt";
import IncomeRegister from "./IncomeRegister";
import IncomeManualForm from "./IncomeManualForm";
import { useStatementUpload } from "./IncomeUploadPanel";
import IncomeQueueTable from "./IncomeQueueTable";
import { Tabs, type TabItem } from "@/components/ui";
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
  /**
   * 1C kesimi bo'yicha to'lagan, lekin ASROda taqsimlanmagan firmalar.
   * Navbat yorlig'ining ikkinchi qismi: yuqoridagi ro'yxat "vipiskada bor,
   * firmasi noma'lum", bu esa teskarisi — "firma to'lagani ma'lum, pul
   * ASROda yo'q".
   */
  unallocated: UnallocatedIncomeReport;
  /** Qaysi oy ko'rsatilayotgani (YYYY-MM) — sarlavhada aytiladi. */
  period: string;
  /** `?tab=` dan SERVERDA o'qilgan boshlang'ich yorliq (hidratsiya uchun). */
  initialTab?: KirimTab;
}

const card: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
};

export default function KirimKassaClient({ accounts, unmatched, companies, kpi, unallocated, period, initialTab = "reyestr" }: Props) {
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


  // Qo'lda kirim: naqd va plastik pul vipiskada ko'rinmaydi, uni odam
  // kiritadi. Backend (createKassaEntry) bor edi, ekran yo'q edi.
  //
  // "offset" — vzaimozachyot/ijara: pul HECH QAYERGA tushmaydi (kanal
  // so'ralmaydi), lekin mijozning qarzini yopadi. CompanyServiceTerm.offsetAmount
  // dan belgilangan oylik limitdan oshirib bo'lmaydi (server tekshiradi).
  const [manualType, setManualType] = useState<"naqd" | "plastik" | "offset" | null>(null);

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
  // VIPISKA YUKLASH — holati va mantiqi `IncomeUploadPanel.tsx` da.
  // Hook ikkita chiziladigan bo'lak qaytaradi, chunki ular ekranning ikki
  // joyida turadi: tugma sarlavhada, panellar sahifa tanasida.
  const upload = useStatementUpload({
    onImported: () => { router.refresh(); bumpRegister(); },
  });

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
            onClick={() => setManualType("naqd")}
          >
            Naqd
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={<CreditCard size={15} />}
            onClick={() => setManualType("plastik")}
          >
            Plastik
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => setManualType("offset")}
            title="Vzaimozachyot/ijara — pul kassaga tushmaydi, faqat qarzni yopadi"
          >
            <Plus size={15} /> Offset
          </Button>
          {upload.fileInput}
          <Button variant="secondary" size="md" disabled={upload.busy} onClick={upload.open}>
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

      {/* QO'LDA TUSHUM — alohida modulda (`IncomeManualForm.tsx`).
          Turni shu yerdagi "Naqd / Plastik / Offset" tugmalari belgilaydi,
          formaning o'n bitta maydoni esa o'z faylida yashaydi. */}
      <IncomeManualForm
        type={manualType}
        companies={companies}
        onClose={() => setManualType(null)}
        onSaved={() => { router.refresh(); bumpRegister(); }}
      />
      {upload.panels}

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

      {tab === "navbat" && (
        <IncomeQueueTable
          unmatched={unmatched}
          companies={companies}
          unallocated={unallocated}
          period={period}
          onDone={() => { router.refresh(); bumpRegister(); }}
        />
      )}
    </div>
  );
}

