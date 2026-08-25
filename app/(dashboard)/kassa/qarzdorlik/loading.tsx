import { SkeletonTable } from "@/components/ui/Skeleton";

/**
 * Qarzdorlik sahifasi uchun yuklanish ekrani — 224 mijozning hisob-kitob
 * varaqasi 1C kesimi bilan solishtiriladi, ya'ni javob boshqa kassa
 * sahifalaridan sezilarli sekinroq (o'lchovda ~1 soniya, kesh sovuq
 * bo'lganda undan ko'p).
 */
export default function QarzdorlikLoading() {
  return (
    <div className="space-y-5 animate-fade-in" aria-busy="true">
      <div className="flex flex-col gap-2">
        <span className="h-5 w-40 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
        <span className="h-3 w-80 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
      </div>

      {/* Hisob-kitob varaqasi sarlavhasi — besh ko'rsatkich */}
      <div
        className="rounded-xl grid grid-cols-2 md:grid-cols-5 gap-px overflow-hidden"
        style={{ background: "var(--card-border)", border: "1px solid var(--card-border)" }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 animate-pulse" style={{ background: "var(--bg-sunken)", height: 78 }} />
        ))}
      </div>

      <div className="dashboard-card !p-0 overflow-hidden">
        <SkeletonTable rows={10} cols={6} />
      </div>
    </div>
  );
}
