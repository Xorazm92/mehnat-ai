
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTHS_UZ } from '../../lib/periods';

interface MonthPickerProps {
    selectedPeriod: string;
    onChange: (p: string) => void;
    className?: string;
}

export const MonthPicker: React.FC<MonthPickerProps> = ({ selectedPeriod, onChange, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

    // Parse initial year/month safely
    const [viewYear, setViewYear] = useState(() => {
        const parts = selectedPeriod.split(' ');
        const y = parseInt(parts[0]);
        return isNaN(y) ? new Date().getFullYear() : y;
    });

    // Tashqaridan davr o'zgarsa ko'rinadigan yilni moslash. Effekt EMAS:
    // React 19 effekt ichidagi sinxron `setState` ni kaskadli render sababi
    // deb belgilaydi. Rasmiy naqsh — render paytida oldingi qiymat bilan
    // solishtirib to'g'rilash.
    const [prevPeriod, setPrevPeriod] = useState(selectedPeriod);
    if (selectedPeriod !== prevPeriod) {
        setPrevPeriod(selectedPeriod);
        const y = parseInt(selectedPeriod.split(' ')[0]);
        if (!isNaN(y)) setViewYear(y);
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

    const handleMonthSelect = (month: string) => {
        onChange(`${viewYear} ${month}`);
        setIsOpen(false);
    };

    return (
        <div className={`inline-block ${className}`} ref={triggerRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="flex items-center gap-2 px-3 py-1.5 c1-input text-body font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors"
            >
                <CalendarIcon size={14} className="text-[var(--brand)]" />
                <span>{selectedPeriod}</span>
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
                                {MONTHS_UZ.map((month) => {
                                    const isSelected = selectedPeriod === `${viewYear} ${month}`;
                                    return (
                                        <button
                                            key={month}
                                            onClick={(e) => { e.stopPropagation(); handleMonthSelect(month); }}
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
