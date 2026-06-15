import { auth } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Sozlamalar</h1>
        <button className="px-4 py-2 bg-accent-blue text-white rounded-xl text-sm font-medium hover:bg-accent-blue/90 transition-colors shadow-lg shadow-accent-blue/20">
          O'zgarishlarni Saqlash
        </button>
      </div>

      <div className="glass-card p-8 flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
          <span className="text-2xl text-accent-blue">⚙️</span>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Tizim Sozlamalari</h3>
        <p className="text-text-secondary max-w-md mx-auto">
          Tizim tili, xabarnoma afzalliklari, soliq rejimlarini boshqarish va xavfsizlik sozlamalari.
        </p>
      </div>
    </div>
  );
}
