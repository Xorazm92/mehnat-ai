import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  getCachedUsers,
  getCachedCompanies,
  getCachedOwnFirmCompanies,
  getCachedOperations,
} from "@/lib/cached-queries";
import StaffClient from "./StaffClient";

export const metadata = { title: "Xodimlar" };

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // ESKI HAVOLA: `/staff?userId=<id>` yon panelni ochardi. Panel o'rniga endi
  // alohida sahifa bor, shuning uchun havola SERVERDA ko'chiriladi — tashqarida
  // qolgan havolalar (bildirishnoma, xatcho'p, kabinetdagi ro'yxat) o'lmasin va
  // foydalanuvchi ro'yxatning bir kadrlik ko'rinishini ko'rmasin.
  const legacyUserId = (await searchParams).userId;
  if (legacyUserId) {
    redirect(`/staff/${Array.isArray(legacyUserId) ? legacyUserId[0] : legacyUserId}`);
  }

  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  // Parallelda ma'lumotlarni cache'dan olish
  // O'Z FIRMALAR HAM: xodim kartochkasidagi "biriktirilgan firmalar" ro'yxati
  // shu massivdan quriladi. `getCachedCompanies` o'z firmalarni chiqarib
  // tashlagani uchun Ruslan (10 ta o'z firmaning buxgalteri) ekranda ishsiz
  // ko'rinardi. Portfelga baribir cheklangan.
  const [staff, clientCompanies, ownFirmCompanies, operations] = await Promise.all([
    getCachedUsers(userId, userRole),
    getCachedCompanies(userId, userRole),
    getCachedOwnFirmCompanies(userId, userRole),
    getCachedOperations(userId, userRole),
  ]);

  const companies = [...clientCompanies, ...ownFirmCompanies];

  // Convert schema objects to frontend format mapping
  const mappedStaff = staff.map(u => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <div className="h-full">
      <StaffClient
        userRole={userRole}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        companies={JSON.parse(JSON.stringify(companies))}
        operations={JSON.parse(JSON.stringify(operations))}
      />
    </div>
  );
}
