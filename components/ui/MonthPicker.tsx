
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
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="flex items-center gap-2 px-3 py-1.5 c1-input text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
                <CalendarIcon size={14} className="text-blue-600" />
                <span>{selectedPeriod}</span>
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[10000]">
                    {/* Minimal backdrop for closing */}
                    <div
                        className="absolute inset-0 bg-slate-900/40"
                        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    />

                    {/* Industrial Popover content */}
                    <div
                        className="absolute bg-[#F0F2F5] dark:bg-[#111318] p-5 w-[280px] rounded-sm shadow-2xl border border-[#DEE2E6] dark:border-[#3A3D44] animate-fade-in"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                        style={{
                            top: coords.top + 4,
                            left: Math.max(10, Math.min(coords.left, window.innerWidth - 290))
                        }}
                    >

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-5 pb-2 border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y - 1); }}
                                    className="p-1.5 hover:bg-white dark:hover:bg-[#22252B] rounded-sm border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44] transition-all text-gray-400 hover:text-[#3366CC]"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-[14px] font-black text-gray-800 dark:text-white uppercase tracking-widest">{viewYear}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y + 1); }}
                                    className="p-1.5 hover:bg-white dark:hover:bg-[#22252B] rounded-sm border border-transparent hover:border-[#DEE2E6] dark:hover:border-[#3A3D44] transition-all text-gray-400 hover:text-[#3366CC]"
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
                                            className={`py-2 px-1 rounded-sm text-[10px] font-bold uppercase tracking-wider transition-all border ${isSelected
                                                ? 'bg-[#3366CC] text-white border-[#2A52A3] shadow-sm'
                                                : 'text-gray-500 dark:text-gray-400 bg-white dark:bg-[#22252B] border-[#DEE2E6] dark:border-[#3A3D44] hover:border-[#3366CC] hover:text-[#3366CC]'
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
