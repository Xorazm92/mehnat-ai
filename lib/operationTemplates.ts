import { OperationTemplate, OperationFieldKey } from '../types';

export const OPERATION_TEMPLATES: OperationTemplate[] = [
    {
        key: 'aylanma_qqs',
        nameUz: 'Aylanma / QQS Hisoboti',
        nameRu: 'Отчет по обороту / НДС',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
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
        key: 'yer_soliq',
        nameUz: 'Yer Solig\'i',
        nameRu: 'Земельный налог',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    },
    {
        key: 'mol_mulk_soliq',
        nameUz: 'Mol-mulk Solig\'i',
        nameRu: 'Налог на имущество',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'yearly'
    },
    {
        key: 'suv_soliq',
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
        key: 'nds_bekor',
        nameUz: 'NDS Bekor Qilish',
        nameRu: 'Отмена НДС',
        assignedRole: 'accountant',
        deadlineDay: 20,
        frequency: 'monthly'
    },
    {
        key: 'it_park',
        nameUz: 'IT Park Hisoboti',
        nameRu: 'Отчет IT Park',
        assignedRole: 'accountant',
        deadlineDay: 10,
        frequency: 'quarterly'
    },
    {
        key: '1c_baza',
        nameUz: '1C Baza Kiritish',
        nameRu: 'Ввод базы 1С',
        assignedRole: 'accountant',
        deadlineDay: 25,
        frequency: 'monthly'
    }
];

export const MAP_JSON_FIELD_TO_KEY: Record<string, OperationFieldKey> = {
    'Aylanma/QQS': 'aylanma_qqs',
    'Daromad soliq': 'daromad_soliq',
    'INPS': 'inps',
    'Foyda soliq': 'foyda_soliq',
    'Moliyaviy natija': 'moliyaviy_natija',
    'Buxgalteriya balansi': 'buxgalteriya_balansi',
    'Yer solig\'i ': 'yer_soliq',
    'Mol mulk solig\'i ma\'lumotnoma': 'mol_mulk_soliq',
    'Suv solig\'i ma\'lumotnoma': 'suv_soliq',
    'Statistika': 'statistika',
    'Bo\'nak': 'bonak',
    'NDSNI BEKOR QILISH': 'nds_bekor',
    'IT PARK Rezidenti': 'it_park',
    '1c': '1c_baza'
};
