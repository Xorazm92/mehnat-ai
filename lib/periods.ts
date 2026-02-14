
export const MONTHS_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

export const generatePeriods = () => {
    const periods: string[] = [];
    const startYear = 2024;
    // const currentYear = new Date().getFullYear();
    const endYear = 2026; // As per user context for 2026 requirements

    for (let year = startYear; year <= endYear; year++) {
        // User requested removing Yearly and Quarterly options.
        // periods.push(`${year} Yillik`);
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
