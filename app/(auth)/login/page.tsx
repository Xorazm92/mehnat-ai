"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        toast.error("Noto'g'ri email yoki parol");
      } else {
        toast.success("Xush kelibsiz!");
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#070A12] text-white overflow-hidden">
      {/* Left / brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] relative p-12 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 0%, #1E3A8A 0%, #0B1220 45%, #070A12 100%)",
          }}
        />
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, #3B82F6, transparent 70%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #6366F1, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <Logo />
        </div>

        <div className="relative">
          <h2 className="text-4xl font-black leading-tight tracking-tight">
            Biznesingizni bir <br /> joydan boshqaring.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300/80 max-w-sm">
            Firmalar, xodimlar, KPI, kassa va hisobotlar — ASRO korporativ
            boshqaruv platformasida yagona, xavfsiz tizimda.
          </p>
          <div className="mt-8 flex items-center gap-2 text-[12px] font-semibold text-slate-400">
            <ShieldCheck size={16} className="text-blue-400" />
            Ma'lumotlaringiz shifrlangan va himoyalangan
          </div>
        </div>

        <div className="relative text-[12px] text-slate-500">
          © 2026 ASRO — Barcha huquqlar himoyalangan
        </div>
      </div>

      {/* Right / form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-8">
            <Logo />
          </div>

          <h1 className="text-2xl font-black tracking-tight">Tizimga kirish</h1>
          <p className="mt-1.5 text-[13px] text-slate-400">
            Davom etish uchun hisobingizga kiring.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Field label="Email manzil">
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ism@asro.uz"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-[14px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all"
                />
              </div>
            </Field>

            <Field label="Parol">
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-[14px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all"
                />
              </div>
            </Field>

            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="group w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[14px] font-bold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Kirilmoqda...
                </>
              ) : (
                <>
                  Kirish
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-slate-600 lg:hidden">
            © 2026 ASRO — Barcha huquqlar himoyalangan
          </p>
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/asro-logo-192.png"
        alt="ASRO"
        width={48}
        height={48}
        priority
        className="w-12 h-12 object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.35)]"
      />
      <div>
        <div className="text-[20px] font-black tracking-tight leading-none">ASRO</div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue-400/80 mt-1">
          Boshqaruv tizimi
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-slate-300">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
