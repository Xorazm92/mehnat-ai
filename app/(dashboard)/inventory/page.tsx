import { auth } from "@/lib/auth";
import { getCachedUsers } from "@/lib/cached-queries";
import { getInventory } from "@/server/inventory";
import InventoryClient from "./InventoryClient";

export const metadata = { title: "Inventar" };

export default async function InventoryPage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const userRole = session?.user?.role || "employee";

  const [staff, inventory] = await Promise.all([
    getCachedUsers(userId, userRole),
    getInventory(),
  ]);

  const items = inventory.map((it) => ({
    id: it.id,
    name: it.name,
    serialNumber: it.serialNumber || undefined,
    status: it.status,
    condition: it.condition,
    assignedToId: it.assignedToId || undefined,
    assignedToName: it.assignedTo?.fullName || undefined,
  }));

  const mappedStaff = staff.map((u) => ({
    ...u,
    name: u.fullName,
    status: u.status || undefined,
  }));

  return (
    <div className="h-full">
      <InventoryClient
        items={JSON.parse(JSON.stringify(items))}
        staff={JSON.parse(JSON.stringify(mappedStaff))}
      />
    </div>
  );
}
