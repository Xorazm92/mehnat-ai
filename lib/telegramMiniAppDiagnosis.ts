// =====================================================
// MINI APP — KIRISH XATOSINING ANIQ SABABI
// =====================================================
//
// Ilgari kirish muvaffaqiyatsiz tugasa foydalanuvchi bitta jumla ko'rardi:
// "Kirib bo'lmadi. Avval botda /start bosib, telefon raqamingizni yuboring."
// Bu jumla ko'p hollarda YOLG'ON edi — allaqachon bog'langan super admin ham
// aynan shuni olardi, chunki haqiqiy sabab boshqa yerda (masalan saytdagi bot
// tokeni bot protsessinikidan farq qiladi). Natijada odam bajarib bo'lmaydigan
// ko'rsatmani qayta-qayta bajarardi va ekran hech qachon o'zgarmasdi.
//
// Bu modul har rad etish sababini ODAM O'QIYDIGAN va HARAKATGA CHAQIRADIGAN
// jumlaga aylantiradi. Sof funksiya — ichida Prisma ham, HTTP ham yo'q.
import type { InitDataResult } from "@/lib/telegramInitData";

/** Kirishni nima to'xtatgani — ekranga chiqadigan va logga yoziladigan kod. */
export type MiniAppDiagnosisCode =
  /** Saytda TELEGRAM_BOT_TOKEN yo'q — kirish umuman ishlamaydi. */
  | "server_no_token"
  /** Imzo tekshiruvidan o'tmadi (token boshqa yoki tekshiruv qoidasi eskirgan). */
  | "bad_signature"
  /** Telegram initData bermadi — sahifa brauzerda ochilgan. */
  | "not_in_telegram"
  /** Oyna uzoq ochiq turgan, initData eskirgan. */
  | "expired"
  /** Imzo to'g'ri, lekin bu Telegram hisobi hech qaysi xodimga bog'lanmagan. */
  | "unlinked"
  /** Xodim bor, lekin o'chirilgan. */
  | "inactive";

export interface MiniAppDiagnosis {
  code: MiniAppDiagnosisCode;
  /** Foydalanuvchiga ko'rsatiladigan matn. */
  message: string;
  /**
   * Muammo foydalanuvchida emas, sozlamada — ekranda "administratorga ayting"
   * deb ajratiladi, chunki odam o'zi hech narsa qila olmaydi.
   */
  admin: boolean;
}

/**
 * Tafsilot oshkor qilinadimi?
 *
 * Ha — va bu ataylab. ASRO ichki tizim: bu ekranni faqat botdagi tugmani
 * bosgan xodim ko'radi, imzoni yasash uchun esa bot tokeni kerak. Sirni
 * yashirishdan olinadigan foyda nolga yaqin, aniq sababdan olinadigan foyda
 * esa katta: sozlama xatosi soatlab emas, bir qarashda topiladi.
 *
 * Yagona istisno YO'Q: token mos kelmasa ham aytiladi, chunki tokenning O'ZI
 * emas, faqat "sayt va bot boshqa token ishlatyapti" fakti aytiladi.
 */
export function diagnoseInitData(result: InitDataResult): MiniAppDiagnosis | null {
  if (result.ok) return null;
  switch (result.reason) {
    case "no_token":
      return {
        code: "server_no_token",
        message:
          "Saytda Telegram bot tokeni sozlanmagan (TELEGRAM_BOT_TOKEN). " +
          "Mini App shusiz ishlamaydi.",
        admin: true,
      };
    case "bad_signature":
      // ATAYIN sababni QAT'IY aytmaydi. Ilgari bu yerda "sayt boshqa bot
      // tokeni bilan ishlayapti" deb yozilgandi va u prod'da YOLG'ON chiqdi:
      // tokenlar bir xil edi, mos kelmagani esa tekshiruv qoidasi haqiqiy
      // Telegram initData'siga (Bot API 7.10 `signature` maydoni) mos
      // emasligidan edi. Aniq bo'lmagan narsani aniq deb aytish — noto'g'ri
      // joyni soatlab qidirishga sabab.
      return {
        code: "bad_signature",
        message:
          "Telegram imzosi tekshiruvdan o'tmadi. Sayt va bot bir xil " +
          "TELEGRAM_BOT_TOKEN ishlatayotganini tekshirish kerak.",
        admin: true,
      };
    case "expired":
      return {
        code: "expired",
        message: "Oyna uzoq ochiq turdi. Yopib, botdagi tugmadan qayta oching.",
        admin: false,
      };
    case "empty":
    case "missing_hash":
    case "missing_user":
      return {
        code: "not_in_telegram",
        message:
          "Telegram ma'lumot bermadi. Bu sahifa Telegram ichidagi tugmadan " +
          "ochilishi kerak.",
        admin: false,
      };
  }
}

/** Imzo to'g'ri, lekin hisob topilmadi/o'chirilgan. */
export function diagnoseAccount(
  telegramUserId: bigint,
  user: { isActive: boolean } | null,
): MiniAppDiagnosis | null {
  if (!user) {
    return {
      code: "unlinked",
      // O'z Telegram id'si ko'rsatiladi: administrator uni bog'lash uchun
      // aynan shu raqamni so'raydi, foydalanuvchi esa uni o'zi topa olmaydi.
      message:
        `Telegram hisobingiz (id: ${telegramUserId}) hech qaysi xodimga ` +
        "bog'lanmagan. Botda /link_me yuboring yoki administratorga ayting.",
      admin: false,
    };
  }
  if (!user.isActive) {
    return {
      code: "inactive",
      message: "Hisobingiz faolsizlantirilgan. Administratorga murojaat qiling.",
      admin: true,
    };
  }
  return null;
}
