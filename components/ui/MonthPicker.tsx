
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

    useEffect(() => {
        const parts = selectedPeriod.split(' ');
        const y = parseInt(parts[0]);
        if (!isNaN(y)) setViewYear(y);
    }, [selectedPeriod]);

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
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-black text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm active:scale-95 min-w-[160px] justify-center group"
            >
                <CalendarIcon size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
                <span>{selectedPeriod}</span>
            </button>

            {isOpen && createPortal(
                <>
                    {/* Backdrop for closing */}
                    <div
                        className="fixed inset-0 z-[9998] bg-transparent"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Popover content */}
                    <div
                        className="fixed z-[9999] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 w-[280px] animate-in fade-in zoom-in-95 duration-200"
                        style={{
                            top: coords.top + 8,
                            left: Math.min(coords.left, window.innerWidth - 300) // Basic overflow check
                        }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <button
                                onClick={(e) => { e.stopPropagation(); setViewYear(y => y - 1); }}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
                            >
                                <ChevronLeft size={18} />
                            </button>
                            <span className="text-lg font-black text-gray-800 dark:text-white">{viewYear}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setViewYear(y => y + 1); }}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {MONTHS_UZ.map((month) => {
                                const isSelected = selectedPeriod === `${viewYear} ${month}`;
                                return (
                                    <button
                                        key={month}
                                        onClick={(e) => { e.stopPropagation(); handleMonthSelect(month); }}
                                        className={`py-2 rounded-lg text-xs font-bold transition-all ${isSelected
                                            ? 'bg-blue-600 text-white shadow-md transform scale-105'
                                            : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400'
                                            }`}
                                    >
                                        {month}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};
