
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_UZ, toYearMonthKey, formatPeriodLabel } from '../../lib/periods';

interface MonthPickerProps {
    selectedPeriod: string;
    onChange: (p: string) => void;
    className?: string;
}

export const MonthPicker: React.FC<MonthPickerProps> = ({ selectedPeriod, onChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    /** Yilni ikkala formatdan ham ishonchli ajratadi ("2026-08" va "2026 Avgust"). */
    const yearOf = (period: string): number | null => {
        const ym = toYearMonthKey(period);
        if (ym) return Number(ym.slice(0, 4));
        const y = parseInt(String(period ?? '').trim().slice(0, 4), 10);
        return Number.isNaN(y) ? null : y;
    };

    const [viewYear, setViewYear] = useState(
        () => yearOf(selectedPeriod) ?? new Date().getFullYear(),
    );

    // Tashqaridan davr o'zgarsa ko'rinadigan yilni moslash. Effekt EMAS:
    // React 19 effekt ichidagi sinxron `setState` ni kaskadli render sababi
    // deb belgilaydi. Rasmiy naqsh — render paytida oldingi qiymat bilan
    // solishtirib to'g'rilash.
    const [prevPeriod, setPrevPeriod] = useState(selectedPeriod);
    if (selectedPeriod !== prevPeriod) {
        setPrevPeriod(selectedPeriod);
        const y = yearOf(selectedPeriod);
        if (y !== null) setViewYear(y);
    }

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom,
                left: rect.left,
                width: rect.width
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('resize', updatePosition);
            // We use capture to catch scroll events from any container
            window.addEventListener('scroll', updatePosition, true);
        }
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen]);

    /**
     * KANONIK "YYYY-MM" chiqaradi.
     *
     * Ilgari bu yer `"2026 Sentyabr"` matnini chiqarardi, holbuki komponent
     * ISO ("2026-08") QABUL QILADI va ekranda ham shuni ko'rsatardi — ya'ni
     * kirish va chiqish formati bir xil emas edi. Oqibati jimgina: oy
     * tanlangach `getReportProofsMeta("2026 Sentyabr")` qat'iy tenglik bilan
     * qidirib 0 ta natija qaytarardi va barcha skrinshot belgilari yo'qolardi;
     * o'sha holatda topshirilgan dalil matnli davr bilan saqlanib, keyin
     * hech qachon ko'rinmasdi.
     */
    const handleMonthSelect = (monthIdx: number) => {
        onChange(`${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`);
        setIsOpen(false);
    };

    return (
        <div className={`inline-block ${className}`} ref={triggerRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="flex items-center gap-2 px-3 py-1.5 c1-input text-body font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors"
            >
                <CalendarIcon size={14} className="text-[var(--brand)]" />
                {/* Qiymat ISO, ko'rinishi odam o'qiydigan: "2026-08" → "2026 Avgust". */}
                <span>{formatPeriodLabel(selectedPeriod)}</span>
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[110]">
                    {/* Minimal backdrop for closing */}
                    <div
                        className="absolute inset-0 bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)]"
                        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    />

                    {/* Industrial Popover content */}
                    <div
                        className="absolute bg-[var(--card-bg)] p-5 w-[280px] rounded-lg shadow-2xl border border-[var(--rule)] dark:border-[var(--rule-strong)] animate-fade-in"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                        style={{
                            top: coords.top + 4,
                            left: Math.max(10, Math.min(coords.left, window.innerWidth - 290))
                        }}
                    >

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-5 pb-2 border-b border-[var(--rule)] dark:border-[var(--rule-strong)]">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y - 1); }}
                                    className="p-1.5 hover:bg-[var(--card-bg)] dark:hover:bg-[var(--surface-2)] rounded-lg border border-transparent hover:border-[var(--rule)] dark:hover:border-[var(--rule-strong)] transition-all text-[var(--text-muted)] hover:text-[var(--brand)]"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-sm font-semibold text-[var(--text-primary)] dark:text-white">{viewYear}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y + 1); }}
                                    className="p-1.5 hover:bg-[var(--card-bg)] dark:hover:bg-[var(--surface-2)] rounded-lg border border-transparent hover:border-[var(--rule)] dark:hover:border-[var(--rule-strong)] transition-all text-[var(--text-muted)] hover:text-[var(--brand)]"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {MONTHS_UZ.map((month, monthIdx) => {
                                    // Ikkala tomon ham kanonik kalitga keltiriladi — tanlangan oy
                                    // davr ISO bo'lsa ham, matnli bo'lsa ham to'g'ri belgilanadi.
                                    const isSelected =
                                        toYearMonthKey(selectedPeriod) ===
                                        `${viewYear}-${String(monthIdx + 1).padStart(2, '0')}`;
                                    return (
                                        <button
                                            key={month}
                                            onClick={(e) => { e.stopPropagation(); handleMonthSelect(monthIdx); }}
                                            className={`py-2 px-1 rounded-lg text-micro font-bold uppercase tracking-wider transition-all border ${isSelected
                                                ? 'bg-[var(--brand)] text-white border-[var(--brand-deep)] shadow-sm'
                                                : 'text-[var(--text-secondary)] bg-[var(--card-bg)] dark:bg-[var(--surface-2)] border-[var(--rule)] dark:border-[var(--rule-strong)] hover:border-[var(--brand)] hover:text-[var(--brand)]'
                                                }`}
                                        >
                                            {month}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
