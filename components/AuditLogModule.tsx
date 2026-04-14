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
        <div className="space-y-4 animate-fade-in p-6 bg-gray-50 dark:bg-[#1A1D23] min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 p-4 rounded shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 text-indigo-600 shrink-0">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight uppercase">
                            {t.auditLogs}
                        </h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            {t.auditSub}
                        </p>
                    </div>
                </div>

                <div className="relative w-full md:w-[350px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder={t.searchAudit}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-[#1e2025] border border-gray-200 dark:border-gray-700 rounded text-sm font-bold text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Audit Table */}
            <div className="bg-white dark:bg-[#22252B] border border-gray-200 dark:border-gray-700 rounded shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-[#1e2025] border-b border-gray-200 dark:border-gray-700">
                                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.time}</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-200 dark:border-gray-700">{t.user}</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-200 dark:border-gray-700">{t.action}</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-200 dark:border-gray-700">{t.object}</th>
                                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-200 dark:border-gray-700">{t.details}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest animate-pulse">{t.loadingAudit}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                                            <History size={32} />
                                            <p className="font-bold uppercase tracking-widest text-[10px]">{t.noDataFound}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-[#1e2025] transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-gray-900 dark:text-white">
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] font-bold text-gray-500 tabular-nums uppercase mt-0.5">
                                                    {new Date(log.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 border-l border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
                                                <User size={12} />
                                            </div>
                                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                                                {log.profiles?.full_name || 'System'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 border-l border-gray-200 dark:border-gray-700">
                                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase border
                                            ${log.action.includes('delete') ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' :
                                                    log.action.includes('update') ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                                                        'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800'}
                                        `}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 border-l border-gray-200 dark:border-gray-700">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">{log.entity_type}</span>
                                            <span className="text-[9px] font-mono text-gray-400 truncate max-w-[120px]">
                                                {log.entity_id}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 border-l border-gray-200 dark:border-gray-700">
                                        <div className="max-w-[200px] truncate text-[10px] font-mono text-gray-500 bg-gray-50 dark:bg-[#1e2025] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 cursor-help" title={JSON.stringify(log.details, null, 2)}>
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
