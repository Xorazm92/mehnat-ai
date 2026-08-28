import { getInvoice } from "@/server/invoices";
import InvoiceDocument from "./InvoiceDocument";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  return (
    <div className="p-6">
      <InvoiceDocument invoice={JSON.parse(JSON.stringify(invoice))} />
    </div>
  );
}
