import React, { useState, useEffect } from 'react';
import { Language } from '../types';
import { supabase } from '../lib/supabaseClient';
import { Search, Shield, History, Calendar, User, Eye, ArrowRight, Activity } from 'lucide-react';

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
        <div className="space-y-8 md:space-y-10 animate-fade-in pb-20">
            {/* Header */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-apple-darkCard p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder gap-8">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-2 flex items-center gap-3">
                        <Shield className="text-apple-accent" size={32} /> System Audit Logs
                    </h2>
                    <p className="text-sm font-semibold text-slate-400">
                        Monitoring all critical actions across the system
                    </p>
                </div>

                <div className="relative w-full xl:w-96">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Action, User, or Entity..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-14 pr-6 py-4 rounded-2xl bg-slate-50 dark:bg-apple-darkBg border border-apple-border dark:border-apple-darkBorder outline-none focus:ring-4 focus:ring-apple-accent/10 font-bold transition-all"
                    />
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white dark:bg-apple-darkCard rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b dark:border-apple-darkBorder bg-slate-50/50 dark:bg-white/5">
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Action</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entity</th>
                                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-apple-darkBorder">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-slate-400 animate-pulse font-bold">Loading audit records...</td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-bold">No audit logs found</td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                {new Date(log.created_at).toLocaleDateString()}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-400 tabular-nums">
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-apple-accent/10 text-apple-accent flex items-center justify-center">
                                                <User size={14} />
                                            </div>
                                            <span className="text-sm font-black text-slate-800 dark:text-white">
                                                {log.profiles?.full_name || 'System'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight
                                            ${log.action.includes('delete') ? 'bg-rose-500/10 text-rose-500' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'bg-emerald-500/10 text-emerald-500' :
                                                    log.action.includes('update') ? 'bg-amber-500/10 text-amber-500' :
                                                        'bg-blue-500/10 text-blue-500'}
                                        `}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{log.entity_type}</span>
                                            <span className="text-[10px] font-mono text-slate-400">{log.entity_id.substring(0, 8)}...</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="max-w-xs truncate text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-white/5 p-2 rounded-lg border border-apple-border dark:border-apple-darkBorder">
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
