/**
 * Grounding knowledge + system prompt for the in-app "Moliyachi AI" assistant.
 *
 * Ported from the standalone Finco/Moliyachi AI seeds (O'zbekiston BHMS, Soliq
 * Kodeksi, Mehnat Kodeksi). Kept compact so it can be injected as the Gemini
 * system instruction on every request without a vector DB — the corpus is small.
 *
 * IMPORTANT: this is reference law/standards text, not live company data. The
 * system prompt below forbids inventing specific amounts and routes the user to
 * the relevant ASRO module for real figures.
 */

export interface KnowledgeChunk {
  title: string;
  category: "BHMS" | "TAX" | "LABOR";
  content: string;
}

export const KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  // ── BHMS (Milliy standartlar) ──
  { title: "BHMS 1 — Hisob siyosati va moliyaviy hisobot", category: "BHMS", content: "Moliyaviy hisobotni tuzish tamoyillari: hisob siyosati, uzluksizlik, daromad va xarajatlarning mosligi. Hisobot haqqoniy va to'liq bo'lishi shart." },
  { title: "BHMS 2 — Asosiy faoliyatdan daromadlar", category: "BHMS", content: "Daromad tan olinadi: mulk huquqi xaridorga o'tsa, qiymatni ishonchli baholab bo'lsa, iqtisodiy naf ehtimoli bo'lsa. Tovar/xizmat, foiz, royalti, dividend." },
  { title: "BHMS 3 — Moliyaviy natijalar hisoboti", category: "BHMS", content: "Sof tushum, sotilgan mahsulot tannarxi, yalpi foyda, davr xarajatlari, asosiy faoliyat foydasi, soliqqacha foyda, sof foyda." },
  { title: "BHMS 4 — Tovar-moddiy zaxiralar (TMZ)", category: "BHMS", content: "TMZ tannarx bo'yicha hisobga olinadi; sof sotish qiymati pastroq bo'lsa — pastki qiymatda. Hisobdan chiqarish: FIFO, o'rtacha tortilgan (AVECO), identifikatsiya usuli." },
  { title: "BHMS 5 — Asosiy vositalar (AV)", category: "BHMS", content: "AV — 1 yildan ortiq foydalaniladigan moddiy aktivlar. Amortizatsiya usullari: to'g'ri chiziqli, ish hajmi, kamayib boruvchi qoldiq." },
  { title: "BHMS 6 — Ijara", category: "BHMS", content: "Moliyaviy ijara (lizing): xatar va naf ijarachiga o'tadi. Operativ ijara: aktiv beruvchi balansida qoladi." },
  { title: "BHMS 7 — Nomoddiy aktivlar", category: "BHMS", content: "Litsenziya, dasturiy ta'minot, gudvill. Tannarx bo'yicha hisob, foydali muddat davomida amortizatsiya." },
  { title: "BHMS 9 — Pul oqimlari hisoboti", category: "BHMS", content: "Pul oqimlari operatsion, investitsiya va moliyaviy faoliyat bo'yicha. Bevosita va bilvosita usul." },
  { title: "BHMS 15 — Buxgalteriya balansi", category: "BHMS", content: "Aktivlar = Majburiyatlar + Xususiy kapital. Aktiv va majburiyatlar joriy/uzoq muddatliga bo'linadi." },
  { title: "BHMS 21 — Hisoblar rejasi", category: "BHMS", content: "Yagona hisoblar rejasi: 0100-0900 asosiy vositalar, 1000-2900 TMZ, 5000-5900 pul mablag'lari, 6000-6900 majburiyatlar, 9000-9900 daromad va xarajatlar." },
  { title: "BHMS 22 — Chet el valyutasi", category: "BHMS", content: "Valyuta moddalari har oy oxirida MB kursi bo'yicha qayta baholanadi; kurs farqi moliyaviy natijaga olib boriladi." },
  { title: "BHMS 24 — Qarz xarajatlari", category: "BHMS", content: "Malakali aktivlar uchun qarz foizlari kapitallashtiriladi (tannarxga qo'shiladi), aks holda davr xarajati." },

  // ── SOLIQ KODEKSI ──
  { title: "Soliq turlari va stavkalar", category: "TAX", content: "QQS 12%; Foyda solig'i 15% (bank/mobil operator 20%); JSHDS 12%; Ijtimoiy soliq 12% (byudjet 25%); mol-mulk, yer, suv, yer qa'ri, aksiz soliqlari." },
  { title: "QQS (Qo'shilgan qiymat solig'i)", category: "TAX", content: "Stavka 12%. Aylanmasi 1 mlrd so'mdan oshganlar majburiy, qolganlar ixtiyoriy. Sotib olishda to'langan QQS sotishdagi QQSdan chegiriladi (offset)." },
  { title: "Foyda solig'i va JSHDS", category: "TAX", content: "Foyda: umumiy 15%, bank/mobil 20%. JSHDS 12%. Dividend/foiz (rezident) 5%." },
  { title: "Aylanmadan olinadigan soliq (soddalashtirilgan)", category: "TAX", content: "Yillik tushumi 1 mlrd so'mgacha subyektlar uchun. Bazaviy stavka 4% (qishloq/savdo/umumiy ovqatlanishda farqlanishi mumkin). Qat'iy summada to'lash ham mumkin." },

  // ── MEHNAT KODEKSI ──
  { title: "Mehnat shartnomasi va ishga qabul", category: "LABOR", content: "Shartnoma muddatsiz yoki muddatli (5 yilgacha). Ishga qabul 16 yoshdan (ba'zan 15/14). Hujjatlar: ID, mehnat daftarchasi, diplom, harbiy bilet." },
  { title: "Ish vaqti va dam olish", category: "LABOR", content: "Normal hafta 40 soatgacha. 16-18 yosh 36 soat, 15 yosh 24 soat. Tushlik 30 daq–2 soat, haftalik dam kamida 42 soat. Yillik ta'til kamida 21 kun." },
  { title: "Ish haqi", category: "LABOR", content: "Oyiga kamida 2 marta (oraliq ≤15 kun). MHEKMdan kam bo'lmaydi. Ish vaqtidan tashqari/bayram — kamida ikki hissa." },
  { title: "Intizomiy choralar va bo'shatish", category: "LABOR", content: "Hayfsan; jarima (o'rtacha oyligning 30%, ba'zan 50% gacha); shartnomani bekor qilish. Xodim tashabbusi — 14 kun oldin ariza." },
];

/** Assemble the corpus into a single grounding block for the system prompt. */
function buildKnowledgeBlock(): string {
  return KNOWLEDGE_CHUNKS.map((c) => `### [${c.category}] ${c.title}\n${c.content}`).join("\n\n");
}

export const ASSISTANT_SYSTEM_INSTRUCTION = `Sen — "ASRO Moliyachi AI", O'zbekiston buxgalteriya autsorsing firmasi uchun moliyaviy yordamchisan.
Vazifang: xodimlarga BHMS (Buxgalteriya Hisobi Milliy Standartlari), Soliq Kodeksi va Mehnat Kodeksi bo'yicha savollariga aniq, qisqa va amaliy javob berish.

QOIDALAR:
- HAR DOIM o'zbek tilida javob ber (agar foydalanuvchi boshqa tilda so'rasa, o'sha tilda).
- Qisqa va aniq yoz. Kerak bo'lsa ro'yxat/bandlar bilan. Ortiqcha muqaddima yozma.
- Quyidagi bilim bazasiga tayan. Bilim bazasida yo'q narsani taxmin qilma — bilmasang, "aniq ma'lumot uchun rasmiy manbaga (lex.uz) yoki bosh buxgalterga murojaat qiling" deb ayt.
- ASRO tizimidagi JONLI ma'lumotlarni (aniq oylik summasi, KPI ballari, muddati o'tgan hisobotlar, kassa qoldig'i) SEN BILMAYSAN va TAXMIN QILMA. Bunday savolларda foydalanuvchini tegishli bo'limga yo'naltir:
  • Oylik/maosh → "Oylik" bo'limi ("Jami to'lov")
  • KPI ballari → "KPI" bo'limi
  • Hisobot holati/muddatlar → "Hisobotlar" bo'limidagi "Amallar matritsasi"
  • Kirim-chiqim/qoldiq → "Kassa" va "Xarajatlar" bo'limlari
- Soliq/stavka hisob-kitoblarida umumiy formulani ko'rsat, lekin firma bo'yicha aniq raqamni o'zing o'ylab topma.
- Moliyaviy maslahat huquqiy kafolat emasligini nazarda tut; muhim qarorlar uchun rasmiy tekshiruvni tavsiya qil.

BILIM BAZASI (O'zbekiston):
${buildKnowledgeBlock()}`;

/**
 * Deterministic keyword fallback used when GEMINI_API_KEY is not configured, so
 * the assistant still gives something useful instead of erroring. Mirrors (and
 * extends) the original UI-shell responses.
 */
export function heuristicReply(userText: string): string {
  const t = userText.toLowerCase();
  let body: string;
  if (t.includes("qqs") || t.includes("nds")) {
    body = "QQS (qo'shilgan qiymat solig'i) — standart stavka 12%. Aylanmasi 1 mlrd so'mdan oshgan korxonalar uchun majburiy. Sotib olishda to'langan QQS sotishdagi QQSdan chegiriladi (offset).";
  } else if (t.includes("aylanma")) {
    body = "Aylanmadan soliq (soddalashtirilgan tizim) — bazaviy stavka 4% (faoliyat turi va hududga qarab farqlanishi mumkin). Yillik tushumi 1 mlrd so'mgacha subyektlar uchun.";
  } else if (t.includes("foyda")) {
    body = "Foyda solig'i — umumiy stavka 15%; banklar va mobil aloqa operatorlari uchun 20%.";
  } else if (t.includes("jshds") || t.includes("daromad solig")) {
    body = "JSHDS (jismoniy shaxs daromad solig'i) — 12%. Dividend va foizlar (rezident) — 5%.";
  } else if (t.includes("ta'til") || t.includes("tatil") || t.includes("otpusk")) {
    body = "Mehnat Kodeksi bo'yicha yillik asosiy ta'til kamida 21 kalendar kun. Ish haftasi 40 soatdan oshmasligi kerak.";
  } else if (t.includes("oylik") || t.includes("maosh") || t.includes("fond")) {
    body = "Oylik fondi = firmalar bo'yicha rol ulushlari yig'indisi. Aniq raqamni ASRO'ning \"Oylik\" bo'limidagi \"Jami to'lov\" ko'rsatadi.";
  } else if (t.includes("kpi")) {
    body = "KPI ballari nazoratchi/bosh buxgalter tasdig'iga qarab bonus yoki jarimaga aylanadi. O'z ballaringizni \"KPI\" bo'limida ko'rasiz.";
  } else if (t.includes("hisobot") || t.includes("muddat")) {
    body = "Muddati o'tgan hisobotlarni \"Hisobotlar\" bo'limidagi \"Amallar matritsasi\"dan ko'rasiz — bajarilmaganlari belgilangan bo'ladi.";
  } else if (t.includes("bhms") || t.includes("standart")) {
    body = "BHMS — Buxgalteriya Hisobi Milliy Standartlari (1–24). Qaysi standart kerakligini ayting (masalan, BHMS 4 — tovar-moddiy zaxiralar), batafsil tushuntiraman.";
  } else {
    body = "Savolingizni tushundim. Aniqroq javob uchun mavzuni (BHMS, soliq yoki mehnat) belgilab bering.";
  }
  return body + "\n\n🔌 Eslatma: AI kaliti (GEMINI_API_KEY) sozlanmagani uchun bu soddalashtirilgan javob.";
}
