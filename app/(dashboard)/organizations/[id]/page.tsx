import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getCachedCompanyById,
  getCachedUsers,
  getCachedTariffPreset,
  getCachedOwnFirms,
  getCachedInternalParties,
} from "@/lib/cached-queries";
import { getRoleContext } from "@/server/roleContext";
import { hydrateBankCredentials } from "@/lib/companyCredentials";
import { mapCompany } from "../mapCompany";
import CompanyDetailClient from "./CompanyDetailClient";

/**
 * FIRMA KARTASI — to'liq sahifa.
 *
 * Ilgari bu karta o'ng tomondan chiqadigan panel (`CompanyDrawer`) edi:
 * to'qqizta yorliq, jamoa jadvali, KPI qoidalari va hujjatlar 850px kenglikka
 * siqilardi. Endi u alohida manzil — ya'ni havolasi ulashiladi, orqaga tugmasi
 * ishlaydi va tanlangan yorliq (`?tab=`) sahifa yangilanganda ham qoladi.
 */

type Props = { params: Promise<{ id: string }> };

/** Bitta firmani portfel darvozasi bilan olib, ekran shakliga keltiradi. */
async function loadCompany(id: string) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const roleContext = await getRoleContext().catch(() => "all" as const);

  const company = await getCachedCompanyById(userId, userRole, id, roleContext);
  if (!company) return null;

  return { session, userId, userRole, company };
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const loaded = await loadCompany(id);
  return { title: loaded ? loaded.company.name : "Firma" };
}

export default async function CompanyDetailPage({ params }: Props) {
  const { id } = await params;
  const loaded = await loadCompany(id);
  // Portfelida bo'lmagan (yoki umuman mavjud bo'lmagan) firma ID si — 404.
  // Ro'yxat so'rovi bilan bir xil darvoza, `lib/access.ts#companyScopeWhere`.
  if (!loaded) notFound();

  const { userId, userRole, company } = loaded;

  const [staff, tariffPreset, ownFirms, internalParties] = await Promise.all([
    getCachedUsers(userId, userRole),
    getCachedTariffPreset(),
    getCachedOwnFirms(),
    getCachedInternalParties(),
  ]);

  // Bank-klient login/parol shifrlangan vault'da — ro'yxat sahifasidagi bilan
  // bir xil yo'l (lib/companyCredentials.ts).
  const [withBank] = await hydrateBankCredentials([company] as any[], userId, userRole);
  const mapped = mapCompany(withBank);

  const mappedStaff = staff.map((u) => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <CompanyDetailClient
      company={JSON.parse(JSON.stringify(mapped))}
      staff={JSON.parse(JSON.stringify(mappedStaff))}
      tariffPreset={tariffPreset}
      internalContractors={ownFirms}
      internalParties={JSON.parse(JSON.stringify(internalParties))}
    />
  );
}
