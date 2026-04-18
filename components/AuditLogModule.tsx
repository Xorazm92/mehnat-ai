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
        <div className="space-y-4 animate-fade-in p-6 bg-[#F8F9FA] dark:bg-[#111318] min-h-screen font-inter group/audit">
            {/* Header */}
            <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] p-5 rounded-sm shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-all border-b-2 border-b-[#3366CC]">
                <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-sm bg-[#FAFBFC] dark:bg-[#111318] flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44] text-[#3366CC] shrink-0 shadow-inner">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-800 dark:text-white leading-none uppercase tracking-tight">
                            {t.auditLogs}
                        </h2>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5 leading-none">
                            {t.auditSub}
                        </p>
                    </div>
                </div>

                <div className="relative w-full md:w-[400px] group/search">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within/search:text-[#3366CC] transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder={t.searchAudit.toUpperCase()}
                        className="w-full pl-11 pr-4 py-2.5 bg-[#F8F9FA] dark:bg-[#111318] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm text-[12px] font-black text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-[#3366CC] transition-all shadow-inner uppercase tracking-tight"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Audit Table */}
            <div className="bg-white dark:bg-[#1A1D23] border border-[#DEE2E6] dark:border-[#3A3D44] rounded-sm shadow-md overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[12px] uppercase tracking-tight">
                        <thead>
                            <tr className="bg-[#FAFBFC] dark:bg-[#111318] border-b border-[#DEE2E6] dark:border-[#3A3D44]">
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{t.time}</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-l border-[#DEE2E6] dark:border-[#3A3D44] leading-none">{t.user}</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-l border-[#DEE2E6] dark:border-[#3A3D44] leading-none">{t.action}</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-l border-[#DEE2E6] dark:border-[#3A3D44] leading-none">{t.object}</th>
                                <th className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-l border-[#DEE2E6] dark:border-[#3A3D44] leading-none">{t.details}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0F2F5] dark:divide-[#1e2025]">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="w-8 h-8 border-3 border-[#3366CC] border-t-transparent rounded-sm animate-spin"></div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">{t.loadingAudit}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3 text-gray-300">
                                            <History size={40} className="opacity-20" />
                                            <p className="font-black uppercase tracking-[0.3em] text-[10px]">{t.noDataFound}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-[#F2F7FF] dark:hover:bg-[#1C2531] transition-all group">
                                    <td className="px-5 py-3 whitespace-nowrap">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-black text-gray-800 dark:text-white text-[12px]">
                                                {new Date(log.created_at).toLocaleDateString()}
                                            </span>
                                            <span className="text-[10px] font-black text-gray-400 tabular-nums uppercase tracking-widest">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-sm bg-[#F8F9FA] dark:bg-[#111318] text-gray-400 flex items-center justify-center border border-[#DEE2E6] dark:border-[#3A3D44] shadow-inner group-hover:text-[#3366CC] transition-colors">
                                                <User size={14} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-black text-gray-800 dark:text-white truncate max-w-[150px] uppercase tracking-tight">
                                                    {log.profiles?.full_name || 'System Auto'}
                                                </span>
                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{log.ip_address || '0.0.0.0'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                        <span className={`px-3 py-1 rounded-sm text-[9px] font-black uppercase border shadow-sm tracking-widest
                                            ${log.action.includes('delete') ? 'bg-[#FEEBF0] text-[#DC3545] border-[#DEE2E6]' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'bg-[#EBFBF0] text-[#28A745] border-[#DEE2E6]' :
                                                    log.action.includes('update') ? 'bg-[#FFF9EB] text-[#FFC107] border-[#DEE2E6]' :
                                                        'bg-[#F2F7FF] text-[#3366CC] border-[#DEE2E6]'}
                                        `}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-black text-gray-800 dark:text-white text-[11px] tracking-tight">{log.entity_type}</span>
                                            <div className="inline-flex items-center px-2 py-0.5 bg-[#F8F9FA] dark:bg-[#111318] rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] text-[8px] font-black text-gray-400 uppercase tracking-widest w-fit">
                                                ID: {log.entity_id.slice(0, 8)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 border-l border-[#DEE2E6] dark:border-[#3A3D44]">
                                        <div className="max-w-[220px] truncate text-[10px] font-mono font-black text-gray-500 bg-[#F8F9FA] dark:bg-[#111318] px-3 py-1.5 rounded-sm border border-[#DEE2E6] dark:border-[#3A3D44] cursor-help group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors shadow-inner" title={JSON.stringify(log.details, null, 2)}>
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
