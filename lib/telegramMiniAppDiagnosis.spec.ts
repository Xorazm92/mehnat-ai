// Mini App kirish xatosining sababi — sof test.
//
// Nima uchun kerak: bu jumlalar odam ko'radigan YAGONA ma'lumot. Sabab
// noto'g'ri bo'lsa (masalan sozlama xatosida "botda /start bosing" deyilsa),
// foydalanuvchi bajarib bo'lmaydigan ishni qayta-qayta bajaradi va haqiqiy
// muammo hech kimga ko'rinmaydi — prod'da aynan shunday bo'lgan.
import { describe, it, expect } from "vitest";
import { diagnoseAccount, diagnoseInitData } from "./telegramMiniAppDiagnosis";

describe("diagnoseInitData", () => {
  it("muvaffaqiyatda sabab bermaydi", () => {
    expect(
      diagnoseInitData({
        ok: true,
        telegramUserId: BigInt(1),
        authDate: new Date(),
      }),
    ).toBeNull();
  });

  // Eng qimmat farq: bu ikkalasi ham SOZLAMA xatosi, foydalanuvchi aybi emas.
  it("token yo'qligini sozlama xatosi deb belgilaydi", () => {
    const d = diagnoseInitData({ ok: false, reason: "no_token" })!;
    expect(d.code).toBe("server_no_token");
    expect(d.admin).toBe(true);
    expect(d.message).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("imzo mos kelmasa sozlama xatosi deb belgilaydi, sababni qat'iy aytmaydi", () => {
    const d = diagnoseInitData({ ok: false, reason: "bad_signature" })!;
    expect(d.code).toBe("bad_signature");
    expect(d.admin).toBe(true);
    // Tokenning O'ZI emas, faqat mos kelmagani aytiladi.
    expect(d.message).not.toMatch(/\d{6,}:/);
  });

  it("muddat va Telegramdan tashqarida ochilishni foydalanuvchi hal qiladi", () => {
    expect(diagnoseInitData({ ok: false, reason: "expired" })).toMatchObject({
      code: "expired",
      admin: false,
    });
    for (const reason of ["empty", "missing_hash", "missing_user"] as const) {
      expect(diagnoseInitData({ ok: false, reason })).toMatchObject({
        code: "not_in_telegram",
        admin: false,
      });
    }
  });
});

describe("diagnoseAccount", () => {
  it("bog'lanmagan hisobda o'z Telegram id'sini beradi", () => {
    const d = diagnoseAccount(BigInt(123456789), null)!;
    expect(d.code).toBe("unlinked");
    // Administrator bog'lash uchun aynan shu raqamni so'raydi.
    expect(d.message).toContain("123456789");
    expect(d.message).toContain("/link_me");
  });

  it("o'chirilgan hisobni bog'lanmagandan ajratadi", () => {
    expect(diagnoseAccount(BigInt(1), { isActive: false })).toMatchObject({
      code: "inactive",
      admin: true,
    });
  });

  it("faol hisobda sabab yo'q", () => {
    expect(diagnoseAccount(BigInt(1), { isActive: true })).toBeNull();
  });
});
