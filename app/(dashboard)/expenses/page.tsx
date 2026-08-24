import { redirect } from "next/navigation";

// `/expenses` `Kassa → Chiqim` ning "Xarajat" tabiga birlashtirildi: ikkalasi
// AYNAN BIR jadvalga (`KassaEntry`) yozardi, faqat ikki alohida sahifada
// ko'rsatilardi — bu "qayerga borishni bilmayman" chalkashligini
// kuchaytirardi. Eski havolalar (bookmark, boshqa sahifadagi link) shu
// yerdan uzilmasin deb redirect qoldirilgan.
export default function ExpensesRedirectPage() {
  redirect("/kassa/chiqim?tab=xarajat");
}
