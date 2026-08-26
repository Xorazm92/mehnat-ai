"use client";

// TIZIM ROLI almashtirgichi — ikki rolli xodimlar uchun.
//
// "Bank klient" va "Buxgalter" kabi ikkita roli bor xodim BIR login bilan
// kirib, shu almashtirgich orqali butun tizimni o'z roliga qarab
// ishlatadi: menyu, sahifa darvozasi va ma'lumotlar yangi rolgа mos
// yangilanadi (proxy + auth ikkalasi ham faol rolni o'qiydi).
//
// Bitta roli bor odamda umuman chizilmaydi — keraksiz shovqin emas.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Check } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import { setActiveRole } from "@/server/activeRole";
import { ROLE_LABELS, type UserRole } from "@/lib/permissions";

interface Props {
  roles: string[];
  active: string;
}

export default function MultiRoleSwitcher({ roles, active }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));

  if (roles.length <= 1) return null;

  const label = (r: string) => ROLE_LABELS[r as UserRole] ?? r;

  const choose = (r: string) => {
    setOpen(false);
    startTransition(async () => {
      await setActiveRole(r);
      // Butun layout yangilanadi: menyu va ma'lumotlar yangi rol bo'yicha.
      router.refresh();
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-meta font-semibold"
        style={{
          background: "var(--accent-blue-light)",
          color: "var(--accent-blue)",
          border: "1px solid var(--card-border)",
        }}
        title="Qaysi rol bilan ishlayotganingizni tanlang"
        aria-label="Rolni almashtirish"
      >
        <UserCog size={14} />
        <span className="hidden sm:inline">{label(active)}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-60 rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            boxShadow: "var(--shadow-overlay)",
          }}
          role="menu"
        >
          {roles.map((r) => (
            <button
              key={r}
              role="menuitem"
              onClick={() => choose(r)}
              disabled={pending}
              className="w-full flex items-center gap-2 px-3 py-2 text-meta text-left disabled:opacity-60"
              style={{
                background: r === active ? "var(--accent-blue-light)" : "transparent",
                color: "var(--text)",
                borderBottom: "1px solid var(--card-border)",
              }}
            >
              <Check
                size={14}
                style={{ color: r === active ? "var(--accent-blue)" : "transparent" }}
              />
              <span className="flex-1">{label(r)}</span>
            </button>
          ))}
          <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)" }}>
            Rol almashganda butun tizim yangi rolga moslashadi — qayta
            kirish shart emas.
          </p>
        </div>
      )}
    </div>
  );
}
