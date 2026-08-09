"use client";

// Rol konteksti almashtirgichi.
//
// Faqat KO'P VAZIFALI odamda ko'rinadi: prodda Go'zaloy 8 firmada buxgalter
// va 132 tasida nazoratchi, Ruslan 65 tasida bank klient va 10 tasida
// buxgalter. Bungacha ular hammasini aralash ko'rardi.
//
// Bitta vazifasi bor odamda (`options.length <= 1`) umuman chizilmaydi —
// keraksiz tanlov shovqin.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Check } from "lucide-react";
import { useDismissable } from "@/hooks/useDismissable";
import { setRoleContext } from "@/server/roleContext";
import type { ContextOption, RoleContext } from "@/lib/roleContext";

interface Props {
  options: ContextOption[];
  current: RoleContext;
}

export default function RoleContextSwitcher({ options, current }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useDismissable<HTMLDivElement>(open, () => setOpen(false));

  if (options.length <= 1) return null;

  const active = options.find((o) => o.context === current) ?? options[0];

  const choose = (context: RoleContext) => {
    setOpen(false);
    startTransition(async () => {
      await setRoleContext(context);
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
          background: current === "all" ? "var(--input-bg)" : "var(--accent-blue-light)",
          color: current === "all" ? "var(--text-secondary)" : "var(--accent-blue)",
          border: "1px solid var(--card-border)",
        }}
        title="Qaysi sifatda ishlayotganingizni tanlang"
      >
        <Layers size={14} />
        <span className="hidden sm:inline">{active.label}</span>
        <span className="tabular-nums opacity-70">{active.count}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-64 rounded-xl overflow-hidden z-50"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))" }}
        >
          {options.map((o) => (
            <button
              key={o.context}
              onClick={() => choose(o.context)}
              className="w-full flex items-center gap-2 px-3 py-2 text-meta text-left"
              style={{
                background: o.context === current ? "var(--accent-blue-light)" : "transparent",
                color: "var(--text)",
                borderBottom: "1px solid var(--card-border)",
              }}
            >
              <Check
                size={14}
                style={{ color: o.context === current ? "var(--accent-blue)" : "transparent" }}
              />
              <span className="flex-1">{o.label}</span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{o.count}</span>
            </button>
          ))}
          <p className="px-3 py-2 text-micro" style={{ color: "var(--text-muted)" }}>
            Tanlov faqat ro&apos;yxatni toraytiradi — huquqni o&apos;zgartirmaydi.
          </p>
        </div>
      )}
    </div>
  );
}
