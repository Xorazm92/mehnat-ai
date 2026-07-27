import { SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Dashboard hududi uchun yuklanish ekrani.
 *
 * Bungacha loyihada birorta `loading.tsx` ham, birorta `<Suspense>` chegarasi
 * ham yo'q edi. Har bir sahifa server komponentida `await Promise.all([...])`
 * qiladi, ya'ni navigatsiya eng sekin so'rovni kutadi va shu vaqt ichida
 * ekranda ESKI sahifa turaveradi — hech qanday belgi bermay. Foydalanuvchi
 * bosgan-bosmaganini bilmay, qayta bosadi.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true">
      {/* Sarlavha o'rni */}
      <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid var(--rule-strong)" }}>
        <span className="w-10 h-10 rounded-xl animate-pulse" style={{ background: "var(--bg-sunken)" }} />
        <div className="flex flex-col gap-2">
          <span className="h-4 w-48 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
          <span className="h-3 w-64 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
        </div>
      </div>

      {/* Ko'rsatkich plitkalari o'rni */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl p-4 animate-pulse"
            style={{ background: "var(--bg-sunken)", border: "1px solid var(--card-border)", height: 88 }}
          />
        ))}
      </div>

      {/* Jadval o'rni */}
      <div className="dashboard-card !p-0 overflow-hidden">
        <SkeletonTable rows={8} cols={6} />
      </div>
    </div>
  );
}
