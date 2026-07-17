"use client";
import React, { createContext, useContext, useState } from "react";

interface Ctx {
  /** Mobil sidebar ochiq/yopiq (slide-in). */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  /** Desktop sidebar yig'ilgan (kenglik 0) holati. */
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

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <MobileNavCtx.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((v) => !v),
        collapsed,
        setCollapsed,
        toggleCollapsed: () => setCollapsed((v) => !v),
      }}
    >
      {children}
    </MobileNavCtx.Provider>
  );
}
