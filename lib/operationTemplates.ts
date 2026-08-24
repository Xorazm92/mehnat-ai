import { OperationTemplate, OperationFieldKey, OperationEntry } from '@/types';

export const OPERATION_TEMPLATES: OperationTemplate[] = [
    {
        key: 'qqs',
        nameUz: 'QQS Hisoboti',
        nameRu: 'Отчет по НДС',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
    },
    {
        // Aylanma soliq CHORAKLIK — QQS bilan bitta ustunda turolmasligining
        // sabablaridan biri aynan shu.
        key: 'aylanma',
        nameUz: 'Aylanma Soliq Hisoboti',
        nameRu: 'Отчет по налогу с оборота',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'quarterly'
    },
    {
        key: 'daromad_soliq',
        nameUz: 'Daromad Solig\'i',
        nameRu: 'Подоходный налог',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'monthly'
    },
    {
        key: 'inps',
        nameUz: 'INPS (Shaxsiy jamg\'arib boriladigan pensiya)',
        nameRu: 'ИНПС',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'monthly'
    },
    {
        key: 'foyda_soliq',
        nameUz: 'Foyda Solig\'i',
        nameRu: 'Налог на прибыль',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
    },
    {
        key: 'moliyaviy_natija',
        nameUz: 'Moliyaviy Natija',
        nameRu: 'Финансовый результат',
        assignedRole: 'accountant',
        deadlineDay: 30,
        frequency: 'quarterly'
    },
    {
        key: 'buxgalteriya_balansi',
        nameUz: 'Buxgalteriya Balansi',
        nameRu: 'Бухгалтерский баланс',
        assignedRole: 'accountant',
        deadlineDay: 30,
        frequency: 'quarterly'
    },
    {
        key: 'yer_soligi',
        nameUz: 'Yer Solig\'i',
        nameRu: 'Земельный налог',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    },
    {
        key: 'mol_mulk_soligi',
        nameUz: 'Mol-mulk Solig\'i',
        nameRu: 'Налог на имущество',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    },
    {
        key: 'suv_soligi',
        nameUz: 'Suv Solig\'i',
        nameRu: 'Налог на воду',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    },
    {
        key: 'statistika',
        nameUz: 'Statistika Hisoboti',
        nameRu: 'Статистический отчет',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'monthly'
    },
    {
        key: 'bonak',
        nameUz: 'Bo\'nak (Avans)',
        nameRu: 'Аванс',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'monthly'
    },
    {
        key: 'nds_bekor_qilish',
        nameUz: 'NDS Bekor Qilish',
        nameRu: 'Отмена НДС',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
    },
    {
        key: 'itpark_oylik',
        nameUz: 'IT Park Hisoboti',
        nameRu: 'Отчет IT Park',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'quarterly'
    },
    {
        key: 'one_c',
        nameUz: '1C Baza Kiritish',
        nameRu: 'Ввод базы 1С',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'monthly'
    },
    {
        key: 'tovar_ostatka',
        nameUz: 'Tovar Qoldig\'i',
        nameRu: 'Товарный остаток',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'monthly'
    },
    {
        key: 'didox',
        nameUz: 'Didox (E-Aylanma)',
        nameRu: 'Дидох',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'monthly'
    },
    {
        key: 'xatlar',
        nameUz: 'Soliq Xatlari',
        nameRu: 'Налоговые письма',
        assignedRole: 'accountant',
        deadlineDay: 5,
        frequency: 'monthly'
    },
    {
        key: 'avtokameral',
        nameUz: 'Avtokameral Nazorat',
        nameRu: 'Автокамерал',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'monthly'
    },
    {
        key: 'my_mehnat',
        nameUz: 'My.Mehnat.uz Nazorati',
        nameRu: 'my.mehnat.uz',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'monthly'
    },
    {
        key: 'pul_oqimlari',
        nameUz: 'Pul Oqimlari (Cash Flow)',
        nameRu: 'Движение денежных средств',
        assignedRole: 'accountant',
        deadlineDay: 30,
        frequency: 'monthly'
    },
    {
        key: 'chiqadigan_soliqlar',
        nameUz: 'Chiqadigan Soliqlar',
        nameRu: 'Исходящие налоги',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
    },
    {
        key: 'hisoblangan_oylik',
        nameUz: 'Hisoblangan Oylik',
        nameRu: 'Начисленная зарплата',
        assignedRole: 'accountant',
        deadlineDay: 5,
        frequency: 'monthly'
    },
    {
        key: 'debitor_kreditor',
        nameUz: 'Debitor va Kreditor',
        nameRu: 'Дебиторы и кредиторы',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'monthly'
    },
    {
        key: 'foyda_va_zarar',
        nameUz: 'Foyda va Zarar Account',
        nameRu: 'Прибыль и убыток',
        assignedRole: 'accountant',
        deadlineDay: 30,
        frequency: 'monthly'
    },
    {
        key: 'ekologiya',
        nameUz: 'Ekologiya Hisoboti',
        nameRu: 'Экологический отчет',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'monthly'
    },
    {
        key: 'jismoniy_ijara',
        nameUz: 'Jismoniy Shaxslarni Ijara Hisoboti va To\'lovi',
        nameRu: 'Отчет и оплата аренды у физлиц',
        assignedRole: 'accountant',
        deadlineDay: 15,
        frequency: 'monthly'
    },
    {
        key: 'stat_1_nnt',
        nameUz: '1-NNT Statistika Hisoboti',
        nameRu: 'Статотчет 1-ННТ',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    }
];

// OperationFieldKey (snake_case, frontend/UI) <-> MonthlyReport ustun nomi (camelCase, Prisma).
// Eslatma: "hisoblangan_oylik" -> "hisoblananOylik" — DB ustuni tarixiy sabablarga ko'ra
// shu nom bilan yaratilgan (mavjud ma'lumotlarni yo'qotmaslik uchun o'zgartirilmadi).
export const FIELD_TO_DB_COLUMN: Record<OperationFieldKey, string> = {
    didox: 'didox',
    xatlar: 'xatlar',
    avtokameral: 'avtokameral',
    my_mehnat: 'myMehnat',
    one_c: 'oneC',
    pul_oqimlari: 'pulOqimlari',
    chiqadigan_soliqlar: 'chiqadiganSoliqlar',
    hisoblangan_oylik: 'hisoblananOylik',
    debitor_kreditor: 'debitorKreditor',
    foyda_va_zarar: 'foydaVaZarar',
    tovar_ostatka: 'tovarOstatka',
    bank_klient: 'bankKlient',
    nds_bekor_qilish: 'ndsBekorQilish',
    qqs: 'qqs',
    aylanma: 'aylanma',
    // DEPRECATED — matritsada ustuni yo'q, lekin eski ma'lumot DB'da turibdi.
    aylanma_qqs: 'aylanmaQqs',
    daromad_soliq: 'daromadSoliq',
    inps: 'inps',
    foyda_soliq: 'foydaSoliq',
    moliyaviy_natija: 'moliyaviyNatija',
    buxgalteriya_balansi: 'buxgalteriyaBalansi',
    statistika: 'statistika',
    bonak: 'bonak',
    yer_soligi: 'yerSoligi',
    mol_mulk_soligi: 'molMulkSoligi',
    suv_soligi: 'suvSoligi',
    stat_12_invest: 'stat12Invest',
    stat_12_moliya: 'stat12Moliya',
    stat_12_korxona: 'stat12Korxona',
    stat_12_narx: 'stat12Narx',
    stat_4_invest: 'stat4Invest',
    stat_4_mehnat: 'stat4Mehnat',
    stat_4_korxona_miz: 'stat4KorxonaMiz',
    stat_4_kb_qur_sav_xiz: 'stat4KbQurSavXiz',
    stat_4_kb_sanoat: 'stat4KbSanoat',
    stat_1_invest: 'stat1Invest',
    stat_1_ih: 'stat1Ih',
    stat_1_energiya: 'stat1Energiya',
    stat_1_korxona: 'stat1Korxona',
    stat_1_korxona_tif: 'stat1KorxonaTif',
    stat_1_moliya: 'stat1Moliya',
    stat_1_akt: 'stat1Akt',
    stat_1_tib: 'stat1Tib',
    stat_1_turizm: 'stat1Turizm',
    stat_4_moliya: 'stat4Moliya',
    aksiz_soligi: 'aksizSoligi',
    nedro_soligi: 'nedroSoligi',
    norezident_foyda: 'norezidentFoyda',
    norezident_nds: 'norezidentNds',
    qqs_tolov: 'qqsTolov',
    aylanma_tolov: 'aylanmaTolov',
    aylanma_qqs_tolov: 'aylanmaQqsTolov',
    daromad_soliq_tolov: 'daromadSoliqTolov',
    inps_tolov: 'inpsTolov',
    foyda_soliq_tolov: 'foydaSoliqTolov',
    itpark_oylik: 'itparkOylik',
    itpark_chorak: 'itparkChorak',
    kom_suv: 'komSuv',
    kom_gaz: 'komGaz',
    kom_svet: 'komSvet',
    ekologiya: 'ekologiya',
    jismoniy_ijara: 'jismoniyIjara',
    stat_1_nnt: 'stat1Nnt',
};

/** Prisma MonthlyReport (camelCase) yozuvini OperationEntry (snake_case) shakliga o'giradi. */
export const mapMonthlyReportToOperationEntry = (report: {
    id: string;
    companyId: string;
    period: string;
    comment: string | null;
    updatedAt: Date | string;
    [key: string]: unknown;
}): OperationEntry => {
    const entry: Record<string, unknown> = {
        id: report.id,
        companyId: report.companyId,
        period: report.period,
        comment: report.comment ?? undefined,
        updatedAt: report.updatedAt instanceof Date ? report.updatedAt.toISOString() : report.updatedAt,
        history: [],
    };

    (Object.keys(FIELD_TO_DB_COLUMN) as OperationFieldKey[]).forEach((fieldKey) => {
        const dbColumn = FIELD_TO_DB_COLUMN[fieldKey];
        const value = report[dbColumn];
        if (value != null) entry[fieldKey] = value;
    });

    return entry as unknown as OperationEntry;
};

export const MAP_JSON_FIELD_TO_KEY: Record<string, OperationFieldKey> = {
    'Aylanma/QQS': 'aylanma',
    'QQS': 'qqs',
    'Daromad soliq': 'daromad_soliq',
    'INPS': 'inps',
    'Foyda soliq': 'foyda_soliq',
    'Moliyaviy natija': 'moliyaviy_natija',
    'Buxgalteriya balansi': 'buxgalteriya_balansi',
    'Yer solig\'i ': 'yer_soligi',
    'Mol mulk solig\'i ma\'lumotnoma': 'mol_mulk_soligi',
    'Suv solig\'i ma\'lumotnoma': 'suv_soligi',
    'Statistika': 'statistika',
    'Bo\'nak': 'bonak',
    'NDSNI BEKOR QILISH': 'nds_bekor_qilish',
    'IT PARK Rezidenti': 'itpark_oylik',
    '1c': 'one_c',
    'Tovar ostatka': 'tovar_ostatka',
    'Didox': 'didox',
    'xatlar': 'xatlar',
    'Avtokameral': 'avtokameral',
    'my mehnat': 'my_mehnat',
    'Pul oqimlari': 'pul_oqimlari',
    'Chiqadigan soliqlar': 'chiqadigan_soliqlar',
    'Hisoblangan oylik': 'hisoblangan_oylik',
    'Debitor kreditor': 'debitor_kreditor',
    'Foyda va zarar': 'foyda_va_zarar',
    'Ekologiya': 'ekologiya'
};
