import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Search, Shield, History, Calendar, User, Eye, ArrowRight, Activity } from 'lucide-react';
import { translations } from '../lib/translations';

interface AuditLog {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    details: any;
    user_id: string;
    ip_address: string;
    created_at: string;
    profiles?: { full_name: string };
}

interface Props {
    lang: Language;
}

const AuditLogModule: React.FC<Props> = ({ lang }) => {
    const t = translations[lang as keyof typeof translations];
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                *,
                profiles (full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (!error && data) {
            setLogs(data);
        }
        setLoading(false);
    };

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        log.profiles?.full_name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Security Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 rounded-[3.5rem] p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-slate-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <Shield size={220} />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 md:gap-10">
                    <div className="w-full">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-[1.2rem] md:rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-glass shrink-0">
                                <Shield className="text-white w-6 h-6 md:w-8 md:h-8" size={32} />
                            </div>
                            <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight premium-text-gradient truncate">
                                {t.auditLogs}
                            </h2>
                        </div>
                        <p className="text-[10px] md:text-sm font-black text-white/40 uppercase tracking-[0.2em] md:tracking-[0.3em]">
                            {t.auditSub}
                        </p>
                    </div>

                    <div className="relative w-full xl:w-[450px] group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-white transition-colors" size={24} />
                        <input
                            type="text"
                            placeholder={t.searchAudit}
                            className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-[1.8rem] outline-none focus:bg-white/10 focus:border-white/20 transition-all font-black text-white placeholder:text-white/20 shadow-inner"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Audit Table */}
            <div className="liquid-glass-card rounded-[3.5rem] shadow-glass-lg border border-white/10 overflow-hidden relative">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 dark:bg-apple-darkBg md:bg-transparent backdrop-blur-md">
                                <th className="px-6 md:px-10 py-6 md:py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sticky left-0 z-20 bg-slate-50 dark:bg-apple-darkBg md:relative md:z-0 md:bg-transparent md:backdrop-blur-none">{t.time}</th>
                                <th className="px-6 md:px-10 py-6 md:py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.user}</th>
                                <th className="px-6 md:px-10 py-6 md:py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.action}</th>
                                <th className="px-6 md:px-10 py-6 md:py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.object}</th>
                                <th className="px-6 md:px-10 py-6 md:py-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t.details}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-32 text-center">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">{t.loadingAudit}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-10 py-32 text-center">
                                        <div className="flex flex-col items-center justify-center gap-6 opacity-30">
                                            <History size={48} className="text-slate-400" />
                                            <p className="font-black uppercase tracking-[0.3em] text-xs">{t.noDataFound}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all group">
                                    <td className="px-6 md:px-10 py-6 md:py-8 sticky left-0 z-10 bg-white dark:bg-apple-darkBg md:relative md:z-0 md:bg-transparent shadow-[10px_0_20px_-10px_rgba(0,0,0,0.05)] md:shadow-none transition-colors">
                                        <div className="flex items-center gap-3 md:gap-4 whitespace-nowrap">
                                            <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-[10px] md:rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                                <Calendar size={14} className="md:w-[18px] md:h-[18px]" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs md:text-sm font-black text-slate-800 dark:text-white">
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-[8px] md:text-[10px] font-black text-slate-400 tabular-nums uppercase tracking-widest mt-1">
                                                    {new Date(log.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 md:px-10 py-6 md:py-8">
                                        <div className="flex items-center gap-3 md:gap-4 whitespace-nowrap">
                                            <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-[10px] md:rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-glass border border-indigo-500/20 group-hover:scale-110 transition-transform">
                                                <User size={14} className="md:w-[18px] md:h-[18px]" />
                                            </div>
                                            <span className="text-xs md:text-sm font-black text-slate-800 dark:text-white truncate max-w-[100px] md:max-w-none">
                                                {log.profiles?.full_name || 'System'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 md:px-10 py-6 md:py-8">
                                        <span className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-sm border whitespace-nowrap
                                            ${log.action.includes('delete') ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                    log.action.includes('update') ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                        'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'}
                                        `}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 md:px-10 py-6 md:py-8">
                                        <div className="flex flex-col gap-1 min-w-[100px]">
                                            <div className="flex items-center gap-2">
                                                <Activity size={10} className="text-indigo-500" />
                                                <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{log.entity_type}</span>
                                            </div>
                                            <span className="text-[8px] md:text-[10px] font-mono text-slate-400/60 lowercase tracking-widest px-2 py-1 bg-slate-50 dark:bg-white/5 rounded-lg border border-transparent group-hover:border-white/10 truncate max-w-[80px] md:max-w-[120px]">
                                                {log.entity_id}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 md:px-10 py-6 md:py-8">
                                        <div className="max-w-[150px] md:max-w-xs truncate text-[9px] md:text-[10px] font-black text-slate-400 bg-slate-50 dark:bg-white/5 px-3 md:px-4 py-2 md:py-3 rounded-[10px] md:rounded-xl border border-transparent group-hover:border-indigo-500/10 transition-all cursor-help" title={JSON.stringify(log.details, null, 2)}>
                                            {JSON.stringify(log.details)}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLogModule;
