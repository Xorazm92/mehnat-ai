"use client";
import React, { createContext, useContext, useState } from "react";

interface Ctx { open: boolean; setOpen: (v: boolean) => void; toggle: () => void; }
const MobileNavCtx = createContext<Ctx>({ open: false, setOpen: () => {}, toggle: () => {} });

export const useMobileNav = () => useContext(MobileNavCtx);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavCtx.Provider value={{ open, setOpen, toggle: () => setOpen((v) => !v) }}>
      {children}
    </MobileNavCtx.Provider>
  );
}
