"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * BREADCRUMB QUYRUG'I — sahifa o'z bo'laklarini yo'l chizig'iga bildiradi.
 *
 * `Breadcrumbs` manzilni FAQAT URL dan quradi, shuning uchun `/organizations/
 * clx…` da oxirgi bo'lak "…" bo'lib turardi: foydalanuvchi qaysi firmada
 * turganini yo'l chizig'idan bilmasdi. ID ni nomga aylantirish uchun kerakli
 * ma'lumot faqat sahifada bor (u firmani yuklaydi), yo'l chizig'i esa
 * `(dashboard)/layout.tsx` da — ya'ni bu ikkisi ota-bola emas va props
 * o'tkazib bo'lmaydi.
 *
 * Shuning uchun kichik modul darajasidagi do'kon: sahifa `<BreadcrumbTrail>`
 * chizadi, `Breadcrumbs` uni `useSyncExternalStore` orqali o'qiydi. Do'konda
 * BITTA yozuv turadi va u pathname bilan birga saqlanadi — boshqa manzilga
 * o'tilganda eski nom ko'rinib qolmasligi uchun.
 */

export interface Crumb {
  /** Berilmasa — bo'lak havola emas, oddiy matn (masalan joriy yorliq). */
  href?: string;
  label: string;
}

interface Snapshot {
  pathname: string;
  crumbs: Crumb[];
}

let snapshot: Snapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * Joriy manzil uchun ro'yxatdan o'tgan bo'laklar. Pathname mos kelmasa `null`:
 * navigatsiya paytida bir kadr davomida eski firma nomi yangi sahifada
 * ko'rinib qolardi.
 */
export function useBreadcrumbTrail(pathname: string): Crumb[] | null {
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
  return snap && snap.pathname === pathname ? snap.crumbs : null;
}

export function BreadcrumbTrail({ crumbs }: { crumbs: Crumb[] }) {
  const pathname = usePathname();
  // Massiv har renderda yangi havola bo'ladi, shuning uchun bog'liqlik
  // qiymat bo'yicha taqqoslanadi — aks holda har render do'konni yangilab,
  // `Breadcrumbs` ni cheksiz qayta chizardi.
  const key = JSON.stringify(crumbs);

  useEffect(() => {
    snapshot = { pathname, crumbs: JSON.parse(key) as Crumb[] };
    emit();
    return () => {
      snapshot = null;
      emit();
    };
  }, [pathname, key]);

  return null;
}

export default BreadcrumbTrail;
