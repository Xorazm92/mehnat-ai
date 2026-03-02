
export const MONTHS_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

export const toYearMonthKey = (period: string) => {
    const raw = String(period || '').trim();
    if (!raw) return '';

    const isoMatch = raw.match(/^\d{4}-(0[1-9]|1[0-2])$/);
    if (isoMatch) return raw;

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
