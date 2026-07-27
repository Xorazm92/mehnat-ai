"use client";

import { useState } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Mail, Lock, Loader2, ArrowRight, ShieldCheck, Eye, EyeOff } from "lucide-react";

// Login sahifasi ataylab har doim to'q: u tema tanlanishidan oldin ko'rinadi,
// shuning uchun tema tokenlariga bog'lanmaydi. Qiymatlar dark palitradan.
const LOGIN_INK = "#0D1014";
const LOGIN_DEEP = "#0C2C49";
const LOGIN_BRAND = "#4FA3E3";
const LOGIN_TEXT_DIM = "#9BA7B4";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      // BITTA generik xabar — barcha muvaffaqiyatsizlik sabablari uchun (hisob
      // yo'q / parol xato / bloklangan hisob / rate limit). Aks holda hujumchi
      // xabar farqidan hisob mavjudligini yoki bloklanganini bilib olardi.
      if (result?.error || result?.ok === false) {
        toast.error("Noto'g'ri email yoki parol");
      } else {
        toast.success("Xush kelibsiz!");
        // callbackUrl bo'lsa o'sha yerga, aks holda "/" ga — proxy rolga mos
        // boshlang'ich sahifaga yo'naltiradi (accountant → /cabinet va h.k.).
        // Faqat ichki yo'llar qabul qilinadi (open-redirect himoyasi).
        const cb = new URLSearchParams(window.location.search).get("callbackUrl");
        const target = cb && cb.startsWith("/") && !cb.startsWith("//") ? cb : "/";
        window.location.href = target;
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh w-full flex overflow-hidden"
      style={{ background: LOGIN_INK, color: "#E4E9EF" }}
    >
      {/* Chap / brend paneli.
          Avvalgi ko'k "orb" radial gradientlari o'rniga — ASRO belgisining
          o'z azure→cyan qanoti va uning ostidagi chartreuse barg chizig'i.
          Fon esa daftar chizig'i: qat'iy, sanaladigan gorizontal chiziqlar. */}
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] relative p-12 overflow-hidden"
        // Panel qirrasi — tasodifiy chok emas, ataylab tortilgan chiziq.
        style={{ borderRight: "1px solid rgba(255,255,255,.10)" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(155deg, ${LOGIN_DEEP} 0%, #0A1622 62%, ${LOGIN_INK} 100%)`,
          }}
        />
        {/* Daftar chizig'i — 28px qadamda, sanaladigan, lekin baqirmaydigan */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,255,255,.06) 0 1px, transparent 1px 28px)",
          }}
        />
        {/* Belgining qanoti — yagona yorug'lik manbai */}
        <div
          className="absolute -right-40 top-1/4 w-[34rem] h-[34rem] rounded-full blur-3xl opacity-25"
          style={{ background: "radial-gradient(circle, #0090E0, transparent 68%)" }}
        />

        <div className="relative animate-rise-in" style={{ animationDelay: "60ms" }}>
          <Logo />
        </div>

        <div className="relative">
          {/* Chartreuse chiziq — sahifadagi yagona "jonli" belgi */}
          <div
            className="w-10 h-0.5 mb-7 animate-rise-in"
            style={{ background: "#9FBE1C", animationDelay: "140ms" }}
          />
          <h2
            className="text-4xl font-semibold leading-[1.15] tracking-tight animate-rise-in"
            style={{ animationDelay: "200ms" }}
          >
            Muddat, hisobot va
            <br />
            oylik — bitta joyda.
          </h2>
          <p
            className="mt-5 text-sm leading-relaxed max-w-sm animate-rise-in"
            style={{ color: "#9FB0C2", animationDelay: "260ms" }}
          >
            Firmalar, xodimlar, KPI, kassa va hisobotlar — ASRO korporativ
            boshqaruv platformasida yagona, xavfsiz tizimda.
          </p>
          <div
            className="mt-10 flex items-center gap-2 font-mono text-meta uppercase animate-rise-in"
            style={{ color: "#7A8A9B", letterSpacing: "0.1em", animationDelay: "320ms" }}
          >
            <ShieldCheck size={15} style={{ color: LOGIN_BRAND }} />
            Ma&apos;lumotlaringiz shifrlangan
          </div>
        </div>

        <div
          className="relative font-mono text-meta"
          style={{ color: "#5A6979" }}
        >
          © 2026 ASRO — Barcha huquqlar himoyalangan
        </div>
      </div>

      {/* O'ng / forma paneli */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise-in" style={{ animationDelay: "120ms" }}>
          <div className="lg:hidden flex justify-center mb-10">
            <Logo />
          </div>

          <h1 className="text-xl font-semibold tracking-tight">Tizimga kirish</h1>
          <p className="mt-2 text-body" style={{ color: LOGIN_TEXT_DIM }}>
            Davom etish uchun hisobingizga kiring.
          </p>
          {/* Sarlavhani formadan ajratuvchi chiziq — chap paneldagi daftar
              chizig'ining shu tomondagi javobi. */}
          <div className="mt-7 h-px" style={{ background: "rgba(255,255,255,.10)" }} />

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field label="Email manzil" htmlFor="email">
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "#5A6979" }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ism@asro.uz"
                  required
                  className="login-input pl-10 pr-4"
                />
              </div>
            </Field>

            <Field label="Parol" htmlFor="password">
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "#5A6979" }}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="login-input pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
                  style={{ color: "#5A6979" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <button
              id="login-btn"
              type="submit"
              disabled={loading}
              className="group w-full h-12 px-4 rounded-lg text-sm font-semibold transition-colors duration-100 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: LOGIN_BRAND, color: LOGIN_INK }}
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

          <p
            className="mt-10 text-center font-mono text-meta lg:hidden"
            style={{ color: "#5A6979" }}
          >
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
        width={44}
        height={44}
        priority
        className="w-11 h-11 object-contain"
      />
      <div>
        <div className="text-xl font-semibold tracking-tight leading-none">ASRO</div>
        <div
          className="font-mono text-micro font-medium uppercase mt-1.5"
          style={{ color: LOGIN_BRAND, letterSpacing: "0.2em" }}
        >
          Boshqaruv tizimi
        </div>
      </div>
    </div>
  );
}

// Yorliq inputga `htmlFor` orqali dasturiy bog'lanadi — ekran o'quvchi
// maydonni nomi bilan e'lon qiladi, yorliq bosilganda fokus maydonga o'tadi.
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block font-mono text-micro font-semibold uppercase"
        style={{ color: LOGIN_TEXT_DIM, letterSpacing: "0.12em" }}
      >
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
