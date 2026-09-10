"use client";

import { Fragment, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { ALLOWED_VIEWS, getHomeRoute, type UserRole } from "@/lib/platform/permissions";
import { NAV_ITEMS, NAV_SECTIONS, NAV_GROUP_LABELS, NAV_TINT_VAR, type NavGroup } from "@/lib/navigation";
import { useMobileNav } from "@/components/MobileNavContext";
// Ikonkalar `NAV_ITEMS` bilan birga keladi (lib/navigation.ts) — bu yerda
// yigirmata ikonka nomi import qilinib, birontasi ishlatilmasdan turardi.

const ALL_NAV_ITEMS = NAV_ITEMS;
const GROUP_LABELS = NAV_GROUP_LABELS;

/** `?tab=xojalik` → "xojalik"; tab yo'q bo'lsa null. */
const tabOf = (href: string): string | null =>
  new URLSearchParams(href.split("?")[1] ?? "").get("tab");

/**
 * UCHINCHI DARAJA — faol MOLIYA bo'limining ichki yorliqlari.
 *
 * Faqat foydalanuvchi o'sha bo'lim sahifasida turganda chiziladi (ota
 * `NavItem` "faol" bo'lganda), shuning uchun yon panel qisqa qoladi: bir
 * vaqtda faqat bitta bo'lim ichi ochiq bo'ladi. To'g'ridan-to'g'ri boshqa
 * yorliqqa sakrash global qidiruvda (`GlobalSearch`) saqlanadi.
 *
 * `useSearchParams` ATAYIN shu kichik komponentda: uni `<Suspense>` ichida
 * chaqirish kerak, aks holda butun sahifa client-render'ga tushadi. Qolgan
 * yon panel `usePathname` bilan ishlaydi va Suspense'siz qoladi.
 */
function SidebarSectionList({
  parentHref,
  allowedViews,
  role,
  onNavigate,
}: {
  parentHref: string;
  allowedViews: string[];
  role: string;
  onNavigate: () => void;
}) {
  const searchParams = useSearchParams();
  const sections = NAV_SECTIONS.filter(
    (s) =>
      s.parentHref === parentHref &&
      allowedViews.includes(s.view as string) &&
      (!s.roles || s.roles.includes(role))
  );
  if (sections.length === 0) return null;

  // Tab berilmagan bo'lsa — reyestrdagi BIRINCHI yorliq faol (sahifalarning
  // `*TabIds` ro'yxatlaridagi "birinchi element = default" qoidasi bilan bir xil).
  const current = searchParams.get("tab") ?? tabOf(sections[0].href);

  return (
    <>
      {sections.map((s) => {
        const Icon = s.icon;
        const isActive = tabOf(s.href) === current;
        return (
          <Link
            key={s.href}
            href={s.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`sidebar-nav-item sidebar-nav-item--grandchild ${isActive ? "active" : ""}`}
          >
            <span className="flex-shrink-0 flex items-center">
              <Icon size={13} />
            </span>
            <span className="flex-1">{s.label}</span>
          </Link>
        );
      })}
    </>
  );
}

interface DashboardSidebarProps {
  userRole: string;
  /** Admin RBAC editoridan kelgan amaldagi view'lar; berilmasa kod default'i. */
  allowedViews?: string[];
}

export function DashboardSidebar({ userRole, allowedViews: allowedViewsProp }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { open, setOpen, collapsed } = useMobileNav();
  const role = userRole as UserRole;
  const allowedViews: string[] = allowedViewsProp ?? ALLOWED_VIEWS[role] ?? [];

  const visibleItems = ALL_NAV_ITEMS.filter((item) =>
    allowedViews.includes(item.view as string)
  );
  const visibleHrefs = new Set(visibleItems.map((i) => i.href));

  /**
   * Uchinchi daraja SHU manzilni allaqachon beradimi.
   *
   * "Xarajatlar" bandi (`/kassa/chiqim?tab=xarajat`) reyestrda IKKI marta
   * bor: `NAV_ITEMS` da alohida band sifatida — chunki `expenses` ruxsati
   * bor-u `kassa_expense` yo'q rollar (Nazoratchi, Bosh buxgalter) "Chiqim
   * kassa" ni umuman ko'rmaydi — va `NAV_SECTIONS` da o'sha sahifaning
   * yorlig'i sifatida. Ikkalasi ham ko'rinadigan rolda (Admin) yon panelda
   * bitta manzil ikki qatorda turardi. Uchinchi daraja uni bergan ekan,
   * ikkinchi darajadagi nusxa olib tashlanadi.
   */
  const coveredBySection = (href: string) =>
    NAV_SECTIONS.some(
      (s) =>
        s.href === href &&
        !!s.parentHref &&
        visibleHrefs.has(s.parentHref) &&
        allowedViews.includes(s.view as string)
    );

  // Yon panelga tushmaydigan elementlar (shaxsiy kabinet — u avatar
  // menyusida). Ota-bola mantig'i YUQORIDAGI `visibleItems` ustida qoladi:
  // u ruxsat chegarasi, bu esa faqat chizish chegarasi.
  const sidebarItems = visibleItems.filter(
    (item) => item.inSidebar !== false && !coveredBySection(item.href)
  );

  // Group items
  const groups: NavGroup[] = ["asosiy", "moliya", "boshqa", "kabinet", "admin"];

  /**
   * Element menyuda MUSTAQIL satr sifatida chiziladimi. Ota bo'limi ham
   * ko'rinadigan bola element mustaqil emas — u otasining ostiga suriladi.
   * Ota ko'rinmasa (rolga berilmagan) bola o'z o'rnida qoladi, aks holda u
   * umuman yo'qolib ketardi.
   */
  const isNested = (item: (typeof visibleItems)[number]) =>
    !!item.parent && visibleHrefs.has(item.parent);

  return (
    <>
    {/* Mobil backdrop */}
    {open && (
      <div
        // Bu dialog EMAS: mobil yon menyuning qorayishi. Panelning o'zi
        // <aside> va u DESKTOPDA ham doimiy ko'rinadi, shuning uchun unga
        // fokus tuzog'ini qo'yish desktop navigatsiyasini buzardi. Escape va
        // kenglik o'zgarishi `MobileNavContext` da hal qilingan.
        // eslint-disable-next-line no-restricted-syntax
        className="fixed inset-0 md:hidden"
        style={{ background: "rgba(6,10,15,0.55)", zIndex: "var(--z-backdrop)" }}
        onClick={() => setOpen(false)}
      />
    )}
    <aside
      className={`flex-shrink-0 h-dvh flex flex-col md:z-20 overflow-hidden transition-transform duration-200 ease-out fixed md:relative top-0 left-0 w-[var(--sidebar-width)] ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-[72px] md:translate-x-0" : "md:w-[var(--sidebar-width)] md:translate-x-0"}`}
      style={{
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
        zIndex: "var(--z-panel)",
      }}
    >
      {/* Logo */}
      <div
        className={`h-16 flex items-center flex-shrink-0 ${collapsed ? "px-4 md:px-0 md:justify-center" : "px-4"}`}
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <Link
          href={getHomeRoute(userRole)}
          onClick={() => setOpen(false)}
          className={`flex items-center transition-opacity hover:opacity-80 ${collapsed ? "gap-2.5 md:gap-0" : "gap-2.5"}`}
          aria-label="Bosh sahifa"
        >
          <Image
            src="/asro-logo-192.png"
            alt="ASRO"
            width={32}
            height={32}
            priority
            className="w-8 h-8 object-contain shrink-0"
          />
          <div className={collapsed ? "md:hidden" : ""}>
            {/*
              `<h1>` EMAS. Yon panel har sahifada bir xil chiziladi, ya'ni
              `<h1>` bo'lsa HAR sahifada ikkita birinchi darajali sarlavha
              bo'lardi: "ASRO" va sahifaning o'z nomi. Ekran o'quvchida
              hujjat tuzilmasi shundan buziladi va `PageHeader` ning
              "sahifada bitta `h1`" shartnomasi ham bajarilmaydi.
              Logotip matni — brend belgisi, sarlavha emas.
            */}
            <span
              className="block text-base font-bold tracking-tight leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              ASRO
            </span>
            <p
              className="font-mono text-micro font-medium uppercase leading-none mt-1"
              style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
            >
              Boshqaruv tizimi
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2.5 scrollbar-hide space-y-0.5">
        {groups.map((group) => {
          const groupItems = sidebarItems.filter((item) => item.group === group);
          if (groupItems.length === 0) return null;

          return (
            <div key={group}>
              {/* Yig'ilgan holatda yorliq o'rniga guruhlarni ajratuvchi chiziq */}
              <div
                className={`hidden ${collapsed ? "md:block" : ""} mx-2 my-2`}
                style={{ height: 1, background: "var(--sidebar-border)" }}
              />
              <div className={`sidebar-label ${collapsed ? "md:hidden" : ""}`}>{GROUP_LABELS[group]}</div>
              {groupItems.map((item) => {
                const Icon = item.icon;
                const nested = isNested(item);
                const hasChildren = groupItems.some((i) => i.parent === item.href);
                // Ota bo'lim bolasi ochilganda "faol" bo'lmaydi: aks holda
                // /kassa/kirim da IKKITA satr yonib turardi va qaysi biri
                // ochiq ekani noaniq bo'lardi.
                const isActive = hasChildren
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");

                // Uchinchi daraja — faqat shu bo'lim ochiq bo'lganda va panel
                // yig'ilmagan bo'lsa. `NAV_SECTIONS` da `parentHref` shu
                // manzilga teng yorliq bo'lishi ham shart (hozircha faqat
                // Kassa bloki + Oylik).
                const showSections =
                  !collapsed &&
                  pathname === item.href &&
                  NAV_SECTIONS.some((s) => s.parentHref === item.href);

                return (
                  <Fragment key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      title={collapsed ? item.label : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={`sidebar-nav-item ${isActive ? "active" : ""} ${collapsed ? "md:justify-center" : ""} ${
                        // Yig'ilgan panelda faqat ikonka ko'rinadi — u yerda
                        // surish o'rniga ikonka biroz kichrayadi.
                        nested && !collapsed ? "sidebar-nav-item--child" : ""
                      }`}
                    >
                      {/* Faol holat jonli chiziq (.sidebar-nav-item.active::before)
                          bilan belgilanadi — chevron shuning uchun olib tashlandi.

                          Ikonka o'z rangida turadi (`NavItem.tint`), FAQAT faol
                          bandda emas: o'sha yerda u yorliq bilan bir rangga
                          o'tadi, aks holda oq tabletka ichida ikki xil rang
                          bo'lib, "qaysi biri hozir ochiq" degan belgi
                          susayardi. */}
                      <span
                        className="flex-shrink-0 flex items-center"
                        style={{ color: isActive ? "inherit" : NAV_TINT_VAR[item.tint] }}
                      >
                        <Icon size={nested ? 14 : 16} />
                      </span>
                      <span className={`flex-1 ${collapsed ? "md:hidden" : ""}`}>{item.label}</span>
                    </Link>
                    {showSections && (
                      <Suspense fallback={null}>
                        <SidebarSectionList
                          parentHref={item.href}
                          allowedViews={allowedViews}
                          role={role}
                          onNavigate={() => setOpen(false)}
                        />
                      </Suspense>
                    )}
                  </Fragment>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Pastda ilgari "joriy rol" kartochkasi turardi: rol nomini IKKINCHI
          marta yozardi (birinchisi header'da, avatar yonida), ismni ham,
          avatarni ham ko'rsatmasdi va bosilmasdi ham — sof o'lik piksel.
          Shaxsga oid hamma narsa endi yuqori o'ngdagi avatar menyusida. */}
    </aside>
    </>
  );
}
