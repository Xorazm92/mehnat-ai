import { listInvoices, currentInvoicePeriod } from "@/server/invoices";
import InvoicesClient from "./InvoicesClient";

export default async function AdminInvoicesPage() {
  const period = await currentInvoicePeriod();
  const invoices = await listInvoices();

  return (
    <div className="p-6">
      <InvoicesClient
        initialPeriod={period}
        invoices={JSON.parse(JSON.stringify(invoices))}
      />
    </div>
  );
}
