/**
 * Amallar matritsasi uchun yuklanish ekrani.
 *
 * Bu loyihadagi ENG SEKIN sahifa: o'lchov paytida kesh sovuq bo'lganda
 * birinchi bayt 13.3 soniyada keldi, birinchi piksel esa 13.4 soniyada.
 * Guruh darajasidagi `loading.tsx` umumiy jadval skeletini chizadi, bu esa
 * matritsaning haqiqiy shakliga — chapda yopishgan firma ustuni, o'ngda
 * 58 ta tor katak — o'xshamaydi va "boshqa sahifa yuklanyapti" taassurotini
 * beradi. Shu sababdan alohida skelet.
 */
export default function ReportsLoading() {
  return (
    <div className="space-y-4 animate-fade-in" aria-busy="true">
      <div className="flex items-center gap-3">
        <span className="h-5 w-52 rounded animate-pulse" style={{ background: "var(--bg-sunken)" }} />
        <span className="h-8 w-40 rounded-lg animate-pulse ml-auto" style={{ background: "var(--bg-sunken)" }} />
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
      >
        {/* Sarlavha qatori */}
        <div className="flex gap-1 p-3" style={{ background: "var(--table-header-bg)" }}>
          <span className="h-7 rounded animate-pulse" style={{ background: "var(--bg-sunken)", width: 260, flex: "none" }} />
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-7 rounded animate-pulse" style={{ background: "var(--bg-sunken)", width: 40, flex: "none" }} />
          ))}
        </div>

        {/* Qatorlar */}
        {Array.from({ length: 12 }).map((_, r) => (
          <div key={r} className="flex gap-1 px-3 py-2" style={{ borderTop: "1px solid var(--table-border)" }}>
            <span className="h-6 rounded animate-pulse" style={{ background: "var(--bg-sunken)", width: 260, flex: "none", opacity: 1 - r * 0.06 }} />
            {Array.from({ length: 16 }).map((_, c) => (
              <span key={c} className="h-6 rounded animate-pulse" style={{ background: "var(--bg-sunken)", width: 40, flex: "none", opacity: 1 - r * 0.06 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
