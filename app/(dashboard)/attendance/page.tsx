import { auth } from "@/lib/auth";
import { getCachedUsers } from "@/lib/cached-queries";
import { getAttendance, getAttendanceMonths } from "@/server/attendance";
import { isSeniorRole } from "@/lib/platform/permissions";
import AttendanceClient from "./AttendanceClient";

export const metadata = { title: "Davomat" };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const canEdit = isSeniorRole(userRole);

  // Bir OY olinadi, "oxirgi 30 kun" emas. Avval oyna suriladigan edi, ya'ni
  // vaqt o'tishi bilan o'tgan oy ekrandan jimgina tushib qolardi — import
  // qilingan davomat "yo'qolgan" ko'rinardi. Oyni foydalanuvchi tanlaydi.
  const sp = await searchParams;
  const months = await getAttendanceMonths();
  const fallback = months[0] ?? new Date().toISOString().slice(0, 7);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : fallback;

  const [year, mon] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, mon - 1, 1));
  // `to` `lte` bilan taqqoslanadi, sanalar esa UTC yarim tunda saqlanadi —
  // oyning oxirgi kuni to'liq kiradi.
  const to = new Date(Date.UTC(year, mon, 0));

  const [staff, attendance] = await Promise.all([
    getCachedUsers(userId, userRole),
    getAttendance({ from, to }),
  ]);

  const records = attendance.map((a) => ({
    id: a.id,
    userId: a.userId,
    userName: a.user?.fullName || "—",
    date: a.date.toISOString(),
    status: a.status,
    checkIn: a.checkIn ? a.checkIn.toISOString() : "",
    checkOut: a.checkOut ? a.checkOut.toISOString() : "",
    notes: a.notes || "",
    lateExcused: a.lateExcused,
    lateExcuseReason: a.lateExcuseReason || "",
  }));

  const mappedStaff = staff.map((u) => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <div className="h-full">
      <AttendanceClient
        records={JSON.parse(JSON.stringify(records))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
        canEdit={canEdit}
        month={month}
        months={months}
      />
    </div>
  );
}
