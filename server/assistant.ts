"use server";

import { GoogleGenAI, type FunctionDeclaration, type Part } from "@google/genai";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/platform/logger";
import {
  ASSISTANT_SYSTEM_INSTRUCTION,
  heuristicReply,
} from "@/lib/ai/knowledge";
import type { AiClaim } from "@/lib/ai/claim";
import {
  getCompanyBalance,
  getCompanyOverdue,
  getRecentPayments,
  getKpiTrend,
  getObligationStatus,
  getLeadingIndicators,
  createRecommendation,
  type CreatedRecommendation,
} from "@/lib/ai/tools";
import { RECOMMENDATION_KINDS } from "@/lib/ai/recommendation";
import { isSeniorRole } from "@/lib/platform/permissions";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  ok: boolean;
  /** Modelning matni. */
  text: string;
  /**
   * Javobda ishlatilgan HAR BIR raqamning pasporti.
   *
   * Model tool chaqirmasa — bo'sh massiv, va bu to'g'ri holat: bilim
   * bazasidan berilgan tushuntirishda ASRO raqami yo'q. Bo'sh emasligi
   * "javobda raqam bor" degani, ya'ni ekran ularni manba havolasi bilan
   * ko'rsatishi mumkin (Modda 7).
   */
  claims: AiClaim[];
  /**
   * Suhbat davomida YARATILGAN tavsiyalar (M5.3).
   *
   * `claims` dan farqi: da'vo — o'qilgan raqam, tavsiya esa navbatga
   * qo'yilgan QAROR. Ekran ularni alohida ro'yxat bilan ko'rsatadi, chunki
   * matn ichida "tavsiya yaratdim" degan gap hech qayerga olib bormaydi —
   * qaror direktor kokpitida qabul qilinadi.
   */
  recommendations: CreatedRecommendation[];
  /** true — kalit yo'q, deterministik fallback javob berdi. */
  fallback?: boolean;
}

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
// gemini-flash-latest = always-current flash alias, which avoids the "no longer
// available to new users" 404 that pinned versions (e.g. gemini-2.5-flash) can
// return on some accounts. On a transient overload/quota error we retry once on
// the lighter, lower-demand lite model.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";
const MAX_INPUT_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

/**
 * SIKL QO'RIQCHILARI — model o'zini to'xtata olmasligi mumkin.
 *
 * `MAX_ROUNDS` — model ↔ tool almashinuvining eng ko'p soni. `MAX_CALLS_PER_TOOL`
 * esa bitta toolni takror-takror chaqirishni to'sadi: modelning eng keng
 * tarqalgan nosozligi — bir xil argument bilan aylanib qolish, va u har
 * chaqiruvda DB so'rovi qiladi.
 */
const MAX_ROUNDS = 4;
const MAX_CALLS_PER_TOOL = 10;

/** Overload/quota errors worth one retry on the fallback model. */
function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /"code":\s*(429|503)/.test(msg) || /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
}

const companyParam = {
  type: "object",
  properties: { companyId: { type: "string", description: "Firma id (uuid)" } },
  required: ["companyId"],
} as const;

/**
 * Gemini'ga e'lon qilinadigan funksiyalar.
 *
 * Tavsiflar ATAYLAB "nima" emas, "qachon" ni aytadi: model qaysi savolga
 * qaysi toolni tanlashini shundan biladi. Har tavsif manbani ham nomlaydi,
 * chunki model javob matnida shunga tayanib gapiradi.
 */
const DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "getCompanyBalance",
    description:
      "Mijoz firmaning pul holati: hisoblangan, to'langan va qoldiq (so'm). " +
      "Manba — qarzdorlik qatlami (lib/debt.ts). \"Falon firma qancha qarzi bor?\" tipidagi savolda.",
    parametersJsonSchema: companyParam,
  },
  {
    name: "getCompanyOverdue",
    description:
      "Mijoz firmaning MUDDATI O'TGAN qarzi, kechikish kunlari va oxirgi tushum davri. " +
      "\"Kim kechiktiryapti?\", \"qancha vaqtdan beri to'lamayapti?\" savollarida.",
    parametersJsonSchema: companyParam,
  },
  {
    name: "getRecentPayments",
    description:
      "Firmaning so'nggi N kundagi tushumlari va NAQD ulushi (offset chiqarib tashlangan). " +
      "\"Oxirgi marta qachon to'lagan?\" savolida.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", description: "Firma id (uuid)" },
        days: { type: "integer", description: "Necha kun orqaga. Standart 30." },
      },
      required: ["companyId"],
    },
  },
  {
    name: "getKpiTrend",
    description:
      "Xodimning so'nggi oylardagi KPI trendi: ball, bonus, jarima va qo'lda tuzatish foizi. " +
      "\"Falon xodimning KPI si qanday?\" savolida.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Xodim id (uuid)" },
        months: { type: "integer", description: "Necha oy. Standart 3." },
      },
      required: ["userId"],
    },
  },
  {
    name: "getLeadingIndicators",
    description:
      "OLDINDAN OGOHLANTIRUVCHI ko'rsatkichlar: yaqin muddatlar, mas'ul yuklamasi, " +
      "rad etish darajasi, qarzdorlik qariligi, topshirish jarayoni. Har biri daraja " +
      "(low/medium/high) bilan. \"Nima qilishim kerak?\", \"xavf bormi?\", " +
      "\"nimaga e'tibor berishim kerak?\" tipidagi savollarda SHU toolni chaqir — " +
      "u o'tmishni emas, yaqin kelajakni ko'rsatadi.",
    parametersJsonSchema: companyParam,
  },
  {
    name: "createRecommendation",
    description:
      "TAVSIYA YARATADI — navbatga qo'yiladi, direktor kokpitida bir bosishda bajariladi. " +
      "Faqat yuqori darajali (high) ko'rsatkich uchun va foydalanuvchi \"nima qilish kerak?\" " +
      "deb so'raganda chaqir. Avval getLeadingIndicators bilan holatni o'lchab ko'r. " +
      "Raqamlarni payloadga YOZMA — ular avtomatik biriktiriladi.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", description: "Firma id (uuid)" },
        kind: {
          type: "string",
          enum: [...RECOMMENDATION_KINDS],
          description:
            "escalate_obligation — majburiyatni nazoratchi/bosh buxgalterga eskalatsiya qilish; " +
            "reassign_responsible — mas'ulni almashtirish; " +
            "review_unmatched_bank — bank sverkasi uchun vazifa ochish; " +
            "postpone_obligation — kechikishni sabab bilan rasmiylashtirish; " +
            "request_documentation — mas'uldan mijoz hujjatini so'rashni talab qilish.",
        },
        rationale: {
          type: "string",
          description: "Nega shu tavsiya — 1-2 gap, odam o'qiydi. Raqam yozma.",
        },
        payload: {
          type: "object",
          description:
            "Amal parametrlari. escalate_obligation: obligationId (+ ixtiyoriy level 0|1|2). " +
            "reassign_responsible: obligationId, toUserId. " +
            "review_unmatched_bank: ixtiyoriy assigneeUserId. " +
            "postpone_obligation: obligationId, delayReason. " +
            "request_documentation: documentName (+ ixtiyoriy toUserId).",
          properties: {
            obligationId: { type: "string" },
            toUserId: { type: "string" },
            assigneeUserId: { type: "string" },
            level: { type: "integer" },
            delayReason: {
              type: "string",
              enum: [
                "accountant_delay",
                "client_delay",
                "system_failure",
                "external_authority",
                "management_decision",
                "other",
              ],
            },
            documentName: { type: "string" },
          },
        },
      },
      required: ["companyId", "kind", "rationale", "payload"],
    },
  },
  {
    name: "getObligationStatus",
    description:
      "Firmaning davr bo'yicha majburiyatlari: jami, bajarilgan, kechikkan. " +
      "\"Falon firmada nima topshirilmagan?\" savolida.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        companyId: { type: "string", description: "Firma id (uuid)" },
        period: { type: "string", description: "Davr kaliti, masalan \"2026-M09\". Berilmasa joriy oy." },
      },
      required: ["companyId"],
    },
  },
];

/**
 * Tool tanlash yo'riqnomasi — bilim bazasiga QO'SHIMCHA, uning o'rniga emas.
 *
 * `ASSISTANT_SYSTEM_INSTRUCTION` (lib/ai/knowledge.ts) hamon "jonli
 * ma'lumotni ko'rmaysan" deydi, chunki u tool CHAQIRILMAGAN holat uchun
 * to'g'ri qoladi. Bu blok esa modelga qachon tool chaqirishni aytadi.
 */
const TOOL_GUIDANCE = `TOOLLAR:
- Foydalanuvchi ANIQ firma haqida raqam so'rasa (qarz, tushum, majburiyat) — tegishli toolni chaqir, raqamni O'YLAB TOPMA.
- "Nima qilishim kerak?", "xavf bormi?", "nimaga e'tibor berishim kerak?" — getLeadingIndicators.
- Tool xato qaytarsa (masalan "firma topilmadi yoki portfelingizda emas") — buni foydalanuvchiga tushuntir, boshqa firma bilan qayta urinma.
- Tool bermagan raqamni javobda YOZMA. Bilim bazasidagi qoidalar raqamsiz tushuntirish uchun.
- Foydalanuvchi ANIQ "nima qilish kerak?" desa: avval getLeadingIndicators, so'ng darajasi "high" bo'lgan HAR ko'rsatkich uchun createRecommendation chaqir. "medium"/"low" uchun tavsiya YARATMA — navbat shovqinga to'lardi.
- Bitta savolda ikkitadan ortiq tavsiya yaratma. Tavsiya yaratganingdan keyin matnda uni QISQA tushuntir: qarorni direktor kokpitda qabul qiladi.`;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, dflt: number): number => (typeof v === "number" && Number.isFinite(v) ? v : dflt);

/**
 * Tool chaqiruvini bajaradi.
 *
 * Har tool O'Z ichida `auth()` va PORTFEL DOIRASINI tekshiradi
 * (`lib/ai/tools.ts`), ya'ni model qanday `companyId` o'ylab topmasin,
 * foydalanuvchining doirasidan tashqarisiga yeta olmaydi. Bu yerda ikkinchi
 * tekshiruv qo'yilmaydi — ikki joyda ikki qoida bo'lsa biri eskirardi.
 */
async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ output: unknown; claims: AiClaim[]; recommendation?: CreatedRecommendation }> {
  const res = await (async () => {
    switch (name) {
      case "getCompanyBalance":
        return getCompanyBalance(str(args.companyId));
      case "getCompanyOverdue":
        return getCompanyOverdue(str(args.companyId));
      case "getRecentPayments":
        return getRecentPayments(str(args.companyId), num(args.days, 30));
      case "getKpiTrend":
        return getKpiTrend(str(args.userId), num(args.months, 3));
      case "getLeadingIndicators":
        return getLeadingIndicators(str(args.companyId));
      case "getObligationStatus":
        return getObligationStatus(str(args.companyId), args.period ? str(args.period) : undefined);
      case "createRecommendation":
        return createRecommendation(
          str(args.companyId),
          str(args.kind),
          str(args.rationale),
          // Payload TEKSHIRILMAY o'tkaziladi — sxema `lib/ai/recommendation.ts`
          // da, `kind` bo'yicha. Bu yerda ikkinchi tekshiruv qo'yilsa ikki
          // qoida bo'lardi va biri eskirardi.
          (args.payload ?? {}) as Record<string, unknown>,
        );
      default:
        return { ok: false as const, error: `Noma'lum tool: ${name}` };
    }
  })();

  if (!res.ok) return { output: { error: res.error }, claims: [] };
  // Yaratilgan tavsiya ekranga ALOHIDA chiqadi — model uni matnda eslatmasa
  // ham foydalanuvchi navbatga nima tushganini ko'rishi kerak.
  const recommendation =
    name === "createRecommendation" ? (res.data as CreatedRecommendation) : undefined;
  return { output: res.data, claims: res.claims, ...(recommendation ? { recommendation } : {}) };
}

/**
 * ASRO Moliyachi AI — in-app (web chat only) assistant.
 *
 * M5.1 dan beri u ASRO ma'lumotini ham o'qiy oladi: Gemini funksiya
 * chaqiruvi orqali `lib/ai/tools.ts` ga boradi. Raqamlar matndan AJRATIB
 * qaytariladi (`claims`) — Modda 7 bo'yicha manbagacha kuzatiladigan bo'lishi
 * uchun. Kalit yo'q bo'lsa deterministik javobga tushadi va yiqilmaydi.
 */
export async function askFinanceAssistant(
  message: string,
  history: AssistantTurn[] = [],
): Promise<AssistantResult> {
  const session = await auth();
  if (!session) {
    return { ok: false, text: "Iltimos, tizimga qayta kiring.", claims: [], recommendations: [] };
  }

  // ROL DARVOZASI (M5.2). Toollarning O'ZIDA portfel doirasi bor (M5.1), lekin
  // yaxlit suhbat undan kengroq: model savolni qayta shakllantiradi, bir necha
  // toolni ketma-ket chaqiradi va natijalarni umumlashtiradi. Buxgalter uchun
  // bu "boshqa firma haqida so'rab ko'rish" maydonini ochadi — doira uni har
  // safar to'sadi, lekin urinishning o'zi ham kerak emas.
  //
  // `isSeniorRole` — mavjud ro'yxat (super_admin | admin | chief_accountant |
  // supervisor). Ikkinchi nusxa yozilmaydi: rol ro'yxati ikki joyda bo'lsa
  // biri albatta eskirardi.
  if (!isSeniorRole(session.user.role as string)) {
    return {
      ok: false,
      text: "AI yordamchi sizning rolingiz uchun ochiq emas.",
      claims: [],
      recommendations: [],
    };
  }

  const question = (message ?? "").trim().slice(0, MAX_INPUT_CHARS);
  if (!question) {
    return { ok: false, text: "Savol bo'sh bo'lishi mumkin emas.", claims: [], recommendations: [] };
  }

  // No key → graceful heuristic answer. Raqam yo'q, demak da'vo ham yo'q.
  if (!API_KEY) {
    return { ok: true, text: heuristicReply(question), claims: [], recommendations: [], fallback: true };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    const contents: { role: "user" | "model"; parts: Part[] }[] = [
      ...history
        .slice(-MAX_HISTORY_TURNS)
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("model" as const),
          parts: [{ text: m.content.slice(0, MAX_INPUT_CHARS) }],
        })),
      { role: "user" as const, parts: [{ text: question }] },
    ];

    const genConfig = {
      systemInstruction: `${ASSISTANT_SYSTEM_INSTRUCTION}\n\n${TOOL_GUIDANCE}`,
      temperature: 0.3,
      maxOutputTokens: 800,
      tools: [{ functionDeclarations: DECLARATIONS }],
    };

    const generate = async () => {
      try {
        return await ai.models.generateContent({ model: MODEL, contents, config: genConfig });
      } catch (err) {
        if (!isTransientGeminiError(err)) throw err;
        // Primary model overloaded/quota-limited → one retry on the lite model.
        await new Promise((r) => setTimeout(r, 700));
        return await ai.models.generateContent({ model: FALLBACK_MODEL, contents, config: genConfig });
      }
    };

    const claims: AiClaim[] = [];
    const recommendations: CreatedRecommendation[] = [];
    const callCount = new Map<string, number>();

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await generate();
      const calls = response.functionCalls ?? [];

      if (calls.length === 0) {
        const text = response.text?.trim();
        if (!text) {
          return {
            ok: false,
            text: "Kechirasiz, javob hosil bo'lmadi. Savolni boshqacharoq yozib ko'ring.",
            claims,
            recommendations,
          };
        }
        return { ok: true, text, claims, recommendations };
      }

      // Model chaqirgan qismni suhbatga qo'shamiz — busiz keyingi aylanishda
      // u o'z chaqiruvini ko'rmaydi va aynan o'shani qayta so'raydi.
      contents.push({
        role: "model",
        parts: calls.map((c) => ({ functionCall: c })),
      });

      const responses: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        const used = (callCount.get(name) ?? 0) + 1;
        callCount.set(name, used);

        if (used > MAX_CALLS_PER_TOOL) {
          responses.push({
            functionResponse: {
              name,
              response: { error: `"${name}" juda ko'p marta chaqirildi — to'xtatildi` },
            },
          });
          continue;
        }

        const { output, claims: got, recommendation } = await runTool(name, call.args ?? {});
        claims.push(...got);
        // Takror yaratishga urinish (`created: false`) ham ro'yxatga tushadi:
        // foydalanuvchi "allaqachon navbatda" ekanini ko'rishi kerak.
        if (recommendation) recommendations.push(recommendation);
        responses.push({ functionResponse: { name, response: { output } } });
      }

      contents.push({ role: "user", parts: responses });
    }

    // Sikl chegarasi — model to'xtamadi. Raqamlar yig'ilgan bo'lsa ular
    // baribir qaytariladi: ish bajarilgan, faqat modelning xulosasi yo'q.
    return {
      ok: false,
      text: "Javob juda uzoq davom etdi. Savolni aniqroq bering (masalan, firma nomini ko'rsating).",
      claims,
      recommendations,
    };
  } catch (err) {
    logServerError("assistant.gemini", err);
    return {
      ok: false,
      text: "AI yordamchi bilan bog'lanishda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
      claims: [],
      recommendations: [],
    };
  }
}
