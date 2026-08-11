
export const MONTHS_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

export const toYearMonthKey = (period: string) => {
    const raw = String(period || '').trim();
    if (!raw) return '';

    const isoMatch = raw.match(/^(\d{4}-(0[1-9]|1[0-2]))/);
    if (isoMatch) return isoMatch[1];

    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return '';

    const year = parts[0];
    if (!/^\d{4}$/.test(year)) return '';

    const monthName = parts.slice(1).join(' ');
    const idx = MONTHS_UZ.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
    if (idx < 0) return '';

    const month = String(idx + 1).padStart(2, '0');
    return `${year}-${month}`;
};

/**
 * Transforms any period input into canonical MonthlyPerformance key format ("YYYY-MM-01").
 */
export const toPerformanceMonth = (period: string): string => {
    const raw = String(period || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw.slice(0, 7)}-01`;
    const ym = toYearMonthKey(raw);
    if (ym) return `${ym}-01`;
    return '';
};

/**
 * Obligation.periodKey monthly form ("YYYY-MM" → "YYYY-MM07" emas, "YYYY-MM7"
 * emas — aniq `2026-M07`). lib/deadlines.ts periodWindowFor shu formatni quradi.
 *
 * DIQQAT: `periodKey: { contains: "2026-07" }` HECH QACHON mos kelmaydi, chunki
 * saqlangan qiymat "2026-M07". Shu sabab obligation bo'yicha qidiruvlar jimgina
 * bo'sh qaytardi. Har doim shu funksiyadan foydalaning.
 */
export const toObligationMonthKey = (period: string): string => {
    const ym = toYearMonthKey(period);
    if (!ym) return '';
    const [year, month] = ym.split('-');
    return `${year}-M${month}`;
};

/**
 * SAQLASH VA QIDIRISH UCHUN KANONIK DAVR KALITI — har doim "YYYY-MM".
 *
 * Tizimda ikki format yonma-yon yuradi: ISO ("2026-08", `getCurrentPeriodKey`)
 * va matnli ("2026 Avgust", `getCurrentPeriod` / MonthPicker). Bazada esa
 * qat'iy tenglik bilan qidiriladi (`where: { period }`), shuning uchun
 * formatlar chalkashsa so'rov JIMGINA bo'sh qaytadi — xato ham chiqmaydi.
 *
 * Aynan shu sabab bitta dalil "2026 Sentyabr" bo'lib saqlanib, nazoratchining
 * ekranida (u ISO davr bilan ochiladi) umuman ko'rinmay qolgan edi.
 *
 * O'qib bo'lmaydigan qiymat asl holida qaytariladi: bo'sh satr bilan qidirish
 * hamma narsani yashirib qo'yardi, asl qiymat esa hech bo'lmasa eski
 * yozuvlarga mos keladi.
 */
export const normalizePeriodKey = (period: string): string =>
    toYearMonthKey(period) || String(period ?? '').trim();

/**
 * KELAJAK DAVRMI? — hisobotni oldindan "topshirib" qo'yishni to'sish uchun.
 *
 * Hisobot davri — u NIMA HAQIDA ekani. Sentyabr hali kelmagan bo'lsa,
 * sentyabr hisoboti mavjud bo'lishi mumkin emas. Buni to'smaganda xodim
 * kalendardan kelajak oyni tanlab "bajarildi" qo'yib qo'yardi va matritsa
 * yolg'on gapirardi.
 *
 * O'TMISH DAVRLAR OCHIQ QOLADI: kechikkan ishni keyin topshirish qonuniy.
 *
 * VAQT MINTAQASI: chegara LOKAL (server TZ=Asia/Tashkent) oy bo'yicha
 * hisoblanadi, `toISOString()` (UTC) bo'yicha emas. Toshkent UTC dan oldinda,
 * shuning uchun lokal oy har doim UTC oyidan katta yoki teng — ya'ni bu
 * tanlov KENGROQ va oy boshidagi 5 soatlik oynada UI taklif qilgan davrni
 * server rad etib qo'ymaydi.
 */
export const isFuturePeriod = (period: string, now: Date = new Date()): boolean => {
    const key = toYearMonthKey(period);
    if (!key) return false; // o'qib bo'lmadi — bu yerda hukm chiqarmaymiz
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return key > current; // "YYYY-MM" da leksikografik tartib = xronologik
};

/** Ko'rsatish uchun: "2026-08" → "2026 Avgust". Mos kelmasa — asl qiymat. */
export const formatPeriodLabel = (period: string): string => {
    const ym = toYearMonthKey(period);
    if (!ym) return String(period ?? '').trim();
    const [year, month] = ym.split('-');
    return `${year} ${MONTHS_UZ[Number(month) - 1]}`;
};

export const periodsEqual = (a: string, b: string) => {
    const ak = toYearMonthKey(a);
    const bk = toYearMonthKey(b);
    if (ak && bk) return ak === bk;
    return String(a || '').trim() === String(b || '').trim();
};

export const generatePeriods = () => {
    const periods: string[] = [];
    const startYear = 2024;
    // const currentYear = new Date().getFullYear();
    const endYear = 2026; // As per user context for 2026 requirements

    for (let year = startYear; year <= endYear; year++) {
        // User requested removing Yearly and Quarterly options.
        periods.push(`${year} Yillik`);
        // periods.push(`${year} Q1`);
        // periods.push(`${year} Q2`);
        // periods.push(`${year} Q3`);
        // periods.push(`${year} Q4`);

        // Add Months ONLY
        MONTHS_UZ.forEach(month => {
            periods.push(`${year} ${month}`);
        });
    }

    return periods;
};

export const AVAILABLE_PERIODS = generatePeriods();

export const getCurrentPeriod = () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthIdx = now.getMonth();
    const monthName = MONTHS_UZ[monthIdx];

    // Return real current month if within range
    if (year >= 2024 && year <= 2026) {
        return `${year} ${monthName}`;
    }
    return `2025 Dekabr`; // Fallback if out of range
};

/**
 * Joriy davr KALITI ("YYYY-MM") — server currentMonth bilan bir xil (UTC).
 * UI period-selektorlarining REAL-VAQT standarti: hech qayerda oyni qotirmang,
 * shu funksiyani chaqiring (server `new Date().toISOString().slice(0,7)` bilan mos).
 */
export const getCurrentPeriodKey = () => new Date().toISOString().slice(0, 7);

/**
 * Returns the ISO-like key (YYYY-MM) for the month preceding the given key.
 */
export const getPreviousPeriodKey = (key: string) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return '';
    const [year, month] = key.split('-').map(Number);
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
};

/**
 * Returns an array of the last N ISO-like keys (YYYY-MM) ending with the given key.
 */
export const getHistoricalPeriods = (endKey: string, count: number = 6) => {
    const historical: string[] = [];
    let current = endKey;
    for (let i = 0; i < count; i++) {
        if (!current) break;
        historical.unshift(current);
        current = getPreviousPeriodKey(current);
    }
    return historical;
};
