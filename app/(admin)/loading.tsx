import { SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Admin hududi uchun yuklanish ekrani.
 *
 * `(dashboard)` guruhida `loading.tsx` bor edi, `(admin)` da — yo'q. Ya'ni
 * admin panelidagi har bir o'tish (foydalanuvchilar, rollar, oy yopilishi)
 * so'rov tugagunicha ESKI sahifani ko'rsatib turardi, hech qanday belgi
 * bermay. Bu ayniqsa sezilarli: `roleViews` va `systemSetting` so'rovlari
 * kesh sovuq bo'lganda sekundlarni oladi.
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true">
      <div className="flex flex-col gap-2 pb-4" style={{ borderBottom: "1px solid var(--rule-strong)" }}>
        <span className="h-5 w-56 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
        <span className="h-3 w-72 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse"
            style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)", height: 92 }}
          />
        ))}
      </div>

      <div className="dashboard-card !p-0 overflow-hidden">
        <SkeletonTable rows={10} cols={5} />
      </div>
    </div>
  );
}
