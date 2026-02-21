
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
                className="flex items-center gap-3 px-6 py-3 bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 rounded-[1.2rem] text-[11px] font-black text-slate-700 dark:text-white hover:bg-white/20 dark:hover:bg-white/10 transition-all shadow-glass active:scale-95 group uppercase tracking-[0.2em] relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <CalendarIcon size={14} className="text-indigo-500 transition-transform group-hover:scale-110 relative z-10" />
                <span className="relative z-10">{selectedPeriod}</span>
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[10000]">
                    {/* Minimal backdrop for closing */}
                    <div
                        className="absolute inset-0 bg-black/5 dark:bg-black/20 backdrop-blur-[2px]"
                        onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    />

                    {/* Premium Popover content */}
                    <div
                        className="absolute liquid-glass-card rounded-[2rem] shadow-glass-2xl border border-white/20 p-8 w-[340px] animate-fade-in-up"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                        style={{
                            top: coords.top + 12,
                            left: Math.max(20, Math.min(coords.left, window.innerWidth - 360))
                        }}
                    >
                        {/* Iridescent background glow */}
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-8">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y - 1); }}
                                    className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-2xl transition-all border border-transparent hover:border-white/10 text-slate-600 dark:text-white group/btn"
                                >
                                    <ChevronLeft size={24} className="group-hover/btn:-translate-x-0.5 transition-transform" />
                                </button>
                                <span className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">{viewYear}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setViewYear(y => y + 1); }}
                                    className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-2xl transition-all border border-transparent hover:border-white/10 text-slate-600 dark:text-white group/btn"
                                >
                                    <ChevronRight size={24} className="group-hover/btn:translate-x-0.5 transition-transform" />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                {MONTHS_UZ.map((month) => {
                                    const isSelected = selectedPeriod === `${viewYear} ${month}`;
                                    return (
                                        <button
                                            key={month}
                                            onClick={(e) => { e.stopPropagation(); handleMonthSelect(month); }}
                                            className={`py-4 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all duration-300 relative overflow-hidden ${isSelected
                                                ? 'bg-indigo-500 text-white shadow-glass-indigo scale-[1.05] liquid-glass-rim'
                                                : 'bg-white/5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-500/10 border border-white/5 hover:border-indigo-500/20'
                                                }`}
                                        >
                                            <span className="relative z-10">{month}</span>
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
