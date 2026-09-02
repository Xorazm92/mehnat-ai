"use client";

// =====================================================
// ISHLAR — birlashgan ish qutisi (majburiyat + vazifa)
// =====================================================
// Ilgari xodim ikki sahifani kuzatardi: `/deadlines` (shablondan hosil bo'lgan
// majburiyat) va `/tasks` (rahbar topshirig'i). Ular bir-birini bilmagani uchun
// bitta ish ikki joyda belgilanardi. Bu yerda ikkalasi BITTA muddat bo'yicha
// saralangan ro'yxat: qator turi (majburiyat/vazifa) ustunda ko'rinadi, amallar
// esa o'z manbasiga yozadi.
//
// Bu fayl endi ORKESTRATSIYA:
//   · ustunlar          → `WorkInboxColumns.tsx`
//   · vazifa formasi    → `WorkTaskForm.tsx`
//   · tip va yorliqlar  → `workInboxTypes.ts`
//   · jadval xulqi      → `components/ui/DataTable` + `hooks/useTableState`
//
// Jadval mexanikasi (saralash, sahifalash, zichlik, mobil kartochka, semantik
// belgilash) qo'lda yozilmaydi — u primitivda. Bu yerda faqat DOMEN qoladi:
// qaysi yorliq nimani ko'rsatadi va amal qaysi serverga yoziladi.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Inbox, UserCheck, AlarmClock, CheckSquare, Users } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { TableToolbar } from "@/components/ui/TableToolbar";
import { DataTable } from "@/components/ui/DataTable";
import { useTableState } from "@/hooks/useTableState";
import { usePageSize } from "@/hooks/usePageSize";
import { useTabParam } from "@/hooks/useTabParam";
import { WORK_TAB_IDS, type WorkTab } from "@/lib/workTabs";
import BulkAssignModal from "@/components/BulkAssignModal";
import { friendlyError } from "@/lib/actionError";

import { buildWorkColumns } from "./WorkInboxColumns";
import { WorkTaskForm } from "./WorkTaskForm";
import {
  SENIOR,
  searchText,
  taskLate,
  type CompanyLite,
  type Counts,
  type ObligationRow,
  type TaskRow,
  type UserLite,
  type WorkRow,
} from "./workInboxTypes";

// `loadWorkInbox.ts` (server) shu tiplarni bu yerdan import qilardi — ya'ni
// server fayli `"use client"` moduliga bog'langan edi. Endi manba
// `workInboxTypes.ts`; qayta eksport eski import yo'llarini sindirmaslik uchun.
export type { ObligationRow, TaskRow, WorkRow };
export type { WorkTab };


export default function WorkInboxClient({
  obligations,
  tasks,
  users,
  companies,
  role,
  userId,
  counts,
  pageSize,
  initialTab = "all",
}: {
  obligations: ObligationRow[];
  tasks: TaskRow[];
  users: UserLite[];
  companies: CompanyLite[];
  role: string;
  userId: string;
  counts: Counts;
  pageSize: number;
  initialTab?: WorkTab;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Yorliq URL'da: bildirishnoma yoki hamkasb "muddati o'tganlarni ko'r" deb
  // `/deadlines?tab=overdue` yuborishi mumkin.
  const [tab, setTab] = useTabParam<WorkTab>("tab", WORK_TAB_IDS, initialTab);

  // Qidiruv / saralash / sahifa — URL'da (`?work_q=`, `work_sort`, `work_page`).
  // `useTableState` URL'ni `history.replaceState` bilan yozadi: navigatsiya
  // ham, server so'rovi ham qo'zg'almaydi. Ma'lumot allaqachon mijozda.
  const table = useTableState({ ns: "work", defaultSortKey: "due", defaultSortDir: "asc" });
  const [viewSize, setViewSize] = usePageSize("work");

  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const isSenior = SENIOR.has(role);
  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const rows = useMemo<WorkRow[]>(() => [...obligations, ...tasks], [obligations, tasks]);

  // Yorliq — DOMEN filtri, shuning uchun bu yerda qoladi (`DataTable` ga
  // biznes qoidasi ko'chirilmaydi). Saralash va sahifalash — primitivda.
  const byTab = useMemo(() => {
    if (tab === "tasks") return rows.filter((r) => r.kind === "task");
    if (tab === "mine")
      return rows.filter((r) =>
        r.kind === "obligation" ? r.responsibleUserId === userId : r.assigneeUserId === userId,
      );
    if (tab === "overdue")
      return rows.filter((r) => (r.kind === "obligation" ? r.isOverdue : taskLate(r)));
    return rows;
  }, [rows, tab, userId]);

  // QIDIRUV — ilgari bu ekranda umuman yo'q edi. Buxgalter bitta firmaning
  // ishini topish uchun 50 qatorlik ro'yxatni ko'z bilan skanerlardi yoki
  // brauzerning Ctrl+F ini ishlatardi (u faqat CHIZILGAN qatorlarni topadi).
  const filtered = useMemo(() => {
    const q = table.debouncedSearch.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter((r) => searchText(r).toLowerCase().includes(q));
  }, [byTab, table.debouncedSearch]);

  // Majburiyat sanoqlari SERVERDAN keladi (`obligations` faqat eng yaqin
  // `pageSize` ta), vazifalar esa to'liq yuklanadi — shuning uchun qo'shiladi.
  const tabCounts = useMemo(
    () => ({
      all: counts.all + tasks.length,
      mine: counts.mine + tasks.filter((t) => t.assigneeUserId === userId).length,
      overdue: counts.overdue + tasks.filter(taskLate).length,
      tasks: tasks.length,
    }),
    [counts, tasks, userId],
  );
  const truncated = counts.all > obligations.length;

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(friendlyError(e) || "Xatolik");
      }
    });

  const columns = useMemo(
    () => buildWorkColumns({ userId, isSenior, pending, users, nameOf, run }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, isSenior, pending, users, nameOf],
  );

  const TABS: TabItem<WorkTab>[] = [
    { id: "all", label: "Hammasi", icon: Inbox, count: tabCounts.all },
    { id: "mine", label: "Mening", icon: UserCheck, count: tabCounts.mine, hint: "Menga biriktirilgan ishlar" },
    { id: "overdue", label: "Muddati o'tgan", icon: AlarmClock, count: tabCounts.overdue },
    { id: "tasks", label: "Vazifalar", icon: CheckSquare, count: tabCounts.tasks, hint: "Faqat qo'lda yaratilgan vazifalar" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CalendarClock size={20} />}
        title="Ishlar"
        description="Majburiyatlar va vazifalar — bitta ro'yxatda, muddati bo'yicha"
        actions={
          isSenior ? (
            <div className="flex items-center gap-2">
              {/* Bir xil ishni o'nlab odamga bittalab yozib chiqmaslik uchun. */}
              <Button variant="secondary" size="sm" icon={<Users size={14} />} onClick={() => setShowBulk(true)}>
                Ommaviy topshiriq
              </Button>
              <Button variant="success" size="sm" onClick={() => setShowForm((s) => !s)}>
                {showForm ? "Bekor" : "+ Yangi vazifa"}
              </Button>
            </div>
          ) : null
        }
      >
        {/* Filtrlar sarlavha ostidagi yorliqlar sifatida: ilgari ular
            sarlavhaning O'NG tomonida "Yangi vazifa" tugmasi bilan bir
            qatorda turardi — ya'ni ko'rinishni almashtiruvchi va ma'lumot
            yaratuvchi boshqaruvlar bir xil og'irlikda ko'rinardi. */}
        <Tabs
          items={TABS}
          value={tab}
          onChange={(next) => { setTab(next); table.setPage(1); }}
          idBase="work"
          ariaLabel="Ishlar filtri"
        />
      </PageHeader>

      {showForm && (
        <WorkTaskForm
          obligations={obligations}
          companies={companies}
          users={users}
          pending={pending}
          run={run}
          onCreated={() => setShowForm(false)}
        />
      )}

      <TableToolbar
        search={table.search}
        onSearchChange={(v) => { table.setSearch(v); table.setPage(1); }}
        searchPlaceholder="Firma, ish nomi yoki davr bo'yicha qidirish…"
        density={table.density}
        onDensityChange={table.setDensity}
      >
        <span className="text-meta" style={{ color: "var(--text-muted)" }}>
          {filtered.length} ta ish
          {truncated && ` · jami ${tabCounts.all}, eng yaqin ${pageSize} majburiyat yuklandi`}
        </span>
      </TableToolbar>

      <DataTable<WorkRow>
        caption="Majburiyatlar va vazifalar ro'yxati"
        rows={filtered}
        columns={columns}
        rowKey={(r) => `${r.kind}-${r.id}`}
        sortKey={table.sortKey}
        sortDir={table.sortDir}
        onToggleSort={table.toggleSort}
        density={table.density}
        page={table.page}
        pageSize={viewSize}
        onPageChange={table.setPage}
        onPageSizeChange={setViewSize}
        emptyIcon={<Inbox size={36} />}
        emptyTitle={tabCounts.all === 0 ? "Hozircha ish yo'q" : "Bu filtrga mos ish yo'q"}
        emptyDescription={
          tabCounts.all === 0
            ? "Majburiyatlar shablon generatsiyasidan, vazifalar esa qo'lda yaratiladi."
            : "Qidiruvni yoki yorliqni o'zgartirib ko'ring."
        }
        emptyAction={
          table.isDirty ? (
            <Button variant="secondary" size="sm" onClick={table.reset}>
              Qidiruv va saralashni tozalash
            </Button>
          ) : undefined
        }
      />

      <BulkAssignModal open={showBulk} onClose={() => setShowBulk(false)} onSent={() => router.refresh()} />
    </div>
  );
}
