"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Moon,
  Sun,
  CalendarClock,
  FileText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
// To'g'ridan-to'g'ri modulidan — `@/components/ui` to'plagichi orqali emas:
// u DataTable, Modal, Drawer va boshqa og'ir mijoz komponentlarini ham
// eksport qiladi va kirish sahifasining to'plamiga ular kerak emas.
import { Field } from "@/components/ui/Field";

/**
 * KIRISH SAHIFASI.
 *
 * Uchta qaror shu yerda yozib qo'yiladi:
 *
 * 1) CHAP PANEL — FOTOSURAT USTIDAGI "HERO". Rasm `next/image` orqali
 *    beriladi, CSS foni sifatida emas: shunda Next uni AVIF/WebP ga
 *    o'giradi va ekran kengligiga qarab kerakli o'lchamini uzatadi.
 *    Panel zamini (`--auth-hero-ground`) rasm yuklanguncha ko'rinadi,
 *    ya'ni sahifa hech qachon oq yaltirab turmaydi.
 *
 * 2) PANEL RANGLARI TEMAGA ERGASHMAYDI. `--auth-hero-*` tokenlari `.dark`
 *    da qayta ta'riflanmagan: rasm ustidagi oq matn yorug' rejimda ham
 *    o'qilishi kerak, ya'ni bu yuza rasmga tegishli, temaga emas.
 *
 * 3) O'NG TOMON — TEMA TOKENLARIDA. Forma, karta va zamin ilovaning o'z
 *    `--card-*`, `--input-*`, `--bg-*` tokenlaridan oziqlanadi va tema
 *    bilan birga aylanadi. Sahifada birorta xom hex yo'q.
 */

/** Chap paneldagi imkoniyatlar — har biri HAQIQIY modulga to'g'ri keladi. */
const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: CalendarClock, label: "Muddat, topshiriq va majburiyat nazorati" },
  { icon: FileText, label: "Hisobot matritsasi, dalil va tasdiqlash" },
  { icon: Wallet, label: "Kassa, qarzdorlik, oylik va KPI" },
];

const COPYRIGHT = "© 2026 ASRO — Barcha huquqlar himoyalangan";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Forma `noValidate`: brauzerning o'z pufakchasi o'rniga sahifaning
    // o'z xato satri ishlatiladi (u ekran o'quvchiga ham bog'langan).
    // Bo'sh maydon serverga umuman yuborilmaydi — bekorga so'rov qilib,
    // keyin "email yoki parol noto'g'ri" deyish chalg'ituvchi bo'lardi.
    if (!email.trim() || !password) {
      setError("Email va parolni kiriting");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      // BITTA generik xabar — barcha muvaffaqiyatsizlik sabablari uchun (hisob
      // yo'q / parol xato / bloklangan hisob / rate limit). Aks holda hujumchi
      // xabar farqidan hisob mavjudligini yoki bloklanganini bilib olardi.
      if (result?.error || result?.ok === false) {
        // Xabar IKKI joyda: forma ichida (qoladi, ekran o'quvchi o'qiydi,
        // maydonga `aria-describedby` bilan bog'lanadi) va toast'da
        // (darhol ko'zga tashlanadi). Faqat toast yetarli emas edi — u
        // o'zi yo'qoladi va fokus formada qolganda hech qanday iz qolmasdi.
        setError("Email yoki parol noto'g'ri");
        toast.error("Email yoki parol noto'g'ri");
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
      setError("Xatolik yuz berdi. Qayta urinib ko'ring.");
      toast.error("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-dvh w-full flex flex-col lg:flex-row"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* ── CHAP: fotosurat ustidagi hero ──────────────────────────────
          Kichik ekranda umuman chizilmaydi: telefonda kirish sahifasining
          yagona vazifasi — kirish, va rasm forma uchun joyni o'g'irlaydi. */}
      <aside
        className="hidden lg:block lg:w-[56%] xl:w-[58%] relative overflow-hidden"
        style={{ backgroundColor: "var(--auth-hero-ground)" }}
      >
        {/* `priority` — bu sahifadagi eng katta element (LCP), kechiktirilmaydi.
            `sizes` da mobil uchun `0px`: panel `lg` dan pastda umuman
            chizilmaydi, ya'ni telefonga bu rasm hech qachon yuklanmaydi. */}
        <Image
          src="/abs.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 58vw, 0px"
          className="object-cover"
        />
        {/* Parda — rasm ustidagi matn kontrastini KAFOLATLAYDI. Pastga
            tomon quyuqlashadi: imkoniyatlar ro'yxati eng pastda turadi va
            rasmning yorug' joyiga tushib qolsa o'qilmay qolardi. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, var(--auth-hero-veil-top), var(--auth-hero-veil-bottom))",
          }}
        />

        <div
          className="relative h-full flex flex-col justify-between p-12 xl:p-16"
          style={{ color: "var(--auth-hero-text)" }}
        >
          {/* Brend */}
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "var(--auth-hero-chip-bg)",
                border: "1px solid var(--auth-hero-chip-border)",
              }}
            >
              <Image
                src="/asro-logo-192.png"
                alt=""
                width={28}
                height={28}
                priority
                className="w-7 h-7 object-contain"
              />
            </span>
            <span className="text-lg font-bold tracking-tight">ASRO</span>
          </div>

          {/* Sarlavha */}
          <div className="max-w-[32rem]">
            <h2 className="text-4xl xl:text-[2.875rem] font-bold leading-[1.14] tracking-tight">
              Bitta tizim.
              <br />
              Har bir firma.
              <br />
              To&apos;liq nazorat.
            </h2>
            <p
              className="mt-6 text-[0.9375rem] leading-relaxed"
              style={{ color: "var(--auth-hero-text-dim)" }}
            >
              Muddat, hisobot, kassa, oylik va KPI — hammasi yagona xavfsiz ish maydonida.
              Har bir yozuv izlanadi, har bir topshiriq egasiga biriktiriladi.
            </p>
          </div>

          {/* Imkoniyatlar */}
          <ul className="flex flex-col gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3.5">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "var(--auth-hero-chip-bg)",
                    border: "1px solid var(--auth-hero-chip-border)",
                  }}
                >
                  <Icon size={17} />
                </span>
                <span className="text-sm font-semibold">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ── O'NG: kirish ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col justify-center items-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[26rem] animate-rise-in">
          {/* Karta ustidagi brend satri */}
          <div className="flex items-center gap-3 mb-5">
            <Image
              src="/asro-logo-192.png"
              alt=""
              width={40}
              height={40}
              priority
              className="w-10 h-10 object-contain"
            />
            <div>
              <div className="text-[0.9375rem] font-bold tracking-tight leading-none">ASRO</div>
              <div
                className="font-mono text-micro font-medium uppercase leading-none mt-1.5"
                style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
              >
                Boshqaruv tizimi
              </div>
            </div>
          </div>

          <div
            className="p-8"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--card-radius)",
              boxShadow: "var(--card-shadow)",
            }}
          >
            <h1 className="text-[1.625rem] font-semibold tracking-tight leading-tight">
              Xush kelibsiz
            </h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Hisobingizga kirish uchun ma&apos;lumotlaringizni kiriting.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-5" noValidate>
              <Field label="Email manzil">
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="ism@kompaniya.uz"
                  disabled={loading}
                  required
                  autoFocus
                  className="erp-input auth-input"
                />
              </Field>

              {/* Ko'rsatish tugmasi Field'ning ICHIGA emas, ustiga qo'yiladi:
                  Field o'z `id` sini BEVOSITA bolasiga beradi, ya'ni input
                  o'ram ichiga solinsa `htmlFor` bog'lanishi yo'qoladi.
                  `top: 22px` — yorliq (16px) + Field'ning `gap-1.5` (6px). */}
              <div className="relative">
                <Field label="Parol" error={error}>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="••••••••"
                    disabled={loading}
                    required
                    className="erp-input auth-input pr-12"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                  aria-pressed={showPassword}
                  className="absolute right-0 w-12 h-12 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
                  style={{ top: 22, color: "var(--text-muted)" }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <button
                id="login-btn"
                type="submit"
                disabled={loading}
                aria-busy={loading || undefined}
                className="mt-1 w-full h-12 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "var(--brand)", color: "var(--on-brand)" }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Kirilmoqda…
                  </>
                ) : (
                  "Kirish"
                )}
              </button>
            </form>

            <div
              className="mt-7 pt-5 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              <span className="text-meta font-medium" style={{ color: "var(--text-muted)" }}>
                Rolga asoslangan xavfsiz kirish
              </span>
              <ThemeToggle />
            </div>
          </div>

          <p className="mt-6 text-center font-mono text-meta" style={{ color: "var(--text-muted)" }}>
            {COPYRIGHT}
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * TEMA TUGMASI — mavjud funksiya, o'ylab topilgan emas: ilovaning ustki
 * panelida (`DashboardTopBar`) xuddi shu tugma bor va shu holatni boshqaradi.
 *
 * `mounted` qo'riqchisi shart: server temani bilmaydi, shuning uchun
 * birinchi renderda ikonka tanlansa mijoz bilan mos kelmay hidratsiya
 * ogohlantirishi chiqadi. Shu sababli u faqat mijozda chiziladi.
 */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // O'lchamni band qilib turadi: tugma paydo bo'lganda qator sakramaydi.
  if (!mounted) return <span className="w-9 h-9" aria-hidden="true" />;

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Yorug' rejim" : "Qorong'u rejim"}
      title={dark ? "Yorug' rejim" : "Qorong'u rejim"}
      className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
      style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
