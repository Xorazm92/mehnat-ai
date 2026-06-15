export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl font-bold text-slate-700 mb-4">403</div>
        <h1 className="text-2xl font-bold text-white mb-2">Kirish taqiqlangan</h1>
        <p className="text-slate-400 mb-6">Sizda bu sahifaga kirish huquqi yo&apos;q.</p>
        <a
          href="/dashboard"
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all text-sm font-medium"
        >
          Dashboardga qaytish
        </a>
      </div>
    </div>
  );
}
