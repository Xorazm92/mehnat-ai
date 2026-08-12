"use client";
import React, { createContext, useCallback, useContext, useState } from "react";

interface Ctx {
  /** Mobil sidebar ochiq/yopiq (slide-in). */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Desktop sidebar yig'ilgan (faqat ikonka) holati. */
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
}
const MobileNavCtx = createContext<Ctx>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
});

export const useMobileNav = () => useContext(MobileNavCtx);

/**
 * Yon panelning yig'ilgan holati SAQLANADI.
 *
 * Bungacha u oddiy `useState` edi: panelni yig'ib qo'ygan odam har bir sahifa
 * yangilanishida uni QAYTADAN yig'ishga majbur bo'lardi (`useAutoRefresh`
 * yo'lni qayta yuklamaydi, lekin brauzerni yangilash yoki qayta kirish
 * holatni nolga qaytarardi).
 *
 * `localStorage` emas, COOKIE ishlatiladi: uni server ham o'qiy oladi
 * (`app/(dashboard)/layout.tsx`), ya'ni sahifa allaqachon TO'G'RI kenglik
 * bilan chiziladi. `localStorage` da holat faqat gidratsiyadan keyin
 * ma'lum bo'lardi va panel har safar keng holatdan yig'ilgan holatga
 * "sakrab" o'tardi.
 */
export const SIDEBAR_COOKIE = "asro_sidebar_collapsed";

function persist(collapsed: boolean) {
  if (typeof document === "undefined") return;
  // Bir yil; `Lax` — bu shunchaki ko'rinish sozlamasi, maxfiy ma'lumot emas.
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

export function MobileNavProvider({
  children,
  initialCollapsed = false,
}: {
  children: React.ReactNode;
  /** Serverda cookie'dan o'qilgan boshlang'ich holat. */
  initialCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(initialCollapsed);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    persist(v);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((v) => {
      persist(!v);
      return !v;
    });
  }, []);

  return (
    <MobileNavCtx.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((v) => !v),
        collapsed,
        setCollapsed,
        toggleCollapsed,
      }}
    >
      {children}
    </MobileNavCtx.Provider>
  );
}
