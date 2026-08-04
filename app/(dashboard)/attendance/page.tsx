import { auth } from "@/lib/auth";
import { getCachedUsers } from "@/lib/cached-queries";
import { getAttendance } from "@/server/attendance";
import { isSeniorRole } from "@/lib/permissions";
import AttendanceClient from "./AttendanceClient";

export const metadata = { title: "Davomat" };

export default async function AttendancePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";
  const canEdit = isSeniorRole(userRole);

  // Oxirgi 30 kunlik davomat
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const [staff, attendance] = await Promise.all([
    getCachedUsers(userId, userRole),
    getAttendance({ from }),
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
      />
    </div>
  );
}
