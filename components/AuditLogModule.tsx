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
        <div className="space-y-6 animate-fade-in p-6 bg-[var(--background)] min-h-screen">
            {/* Header */}
            <div className="dashboard-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--primary)] to-[var(--primary-dark)]"></div>
                <div className="flex items-center gap-5 relative z-10">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner" style={{ background: 'var(--primary-ghost)', color: 'var(--primary)' }}>
                        <Shield size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black leading-none uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                            {t.auditLogs}
                        </h2>
                        <p className="text-[11px] font-bold uppercase tracking-widest mt-2 leading-none" style={{ color: 'var(--text-3)' }}>
                            {t.auditSub}
                        </p>
                    </div>
                </div>

                <div className="relative w-full md:w-[400px] group/search z-10">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-3)' }} size={16} />
                    <input
                        type="text"
                        placeholder={t.searchAudit.toUpperCase()}
                        className="w-full pl-11 pr-4 py-3 rounded-xl text-[12px] font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 placeholder:text-[var(--text-3)] shadow-sm"
                        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Audit Table */}
            <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[12px] uppercase tracking-widest">
                        <thead>
                            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                                <th className="px-6 py-4 text-[10px] font-black leading-none" style={{ color: 'var(--text-3)' }}>{t.time}</th>
                                <th className="px-6 py-4 text-[10px] font-black border-l leading-none" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>{t.user}</th>
                                <th className="px-6 py-4 text-[10px] font-black border-l leading-none" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>{t.action}</th>
                                <th className="px-6 py-4 text-[10px] font-black border-l leading-none" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>{t.object}</th>
                                <th className="px-6 py-4 text-[10px] font-black border-l leading-none" style={{ color: 'var(--text-3)', borderColor: 'var(--border)' }}>{t.details}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y transition-colors" style={{ divideColor: 'var(--border)' }}>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center border-t" style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}></div>
                                            <p className="text-[11px] font-bold uppercase tracking-widest animate-pulse" style={{ color: 'var(--text-3)' }}>{t.loadingAudit}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center border-t" style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <History size={48} style={{ color: 'var(--text-3)' }} className="opacity-50" />
                                            <p className="font-bold uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-3)' }}>{t.noDataFound}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="transition-all group hover:bg-[var(--surface-2)]" style={{ borderTop: '1px solid var(--border)' }}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-bold text-[12px]" style={{ color: 'var(--text)' }}>
                                                {new Date(log.created_at).toLocaleDateString()}
                                            </span>
                                            <span className="text-[10px] font-bold tabular-nums uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>
                                                {new Date(log.created_at).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                                                <User size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold truncate max-w-[150px] uppercase tracking-widest text-[11px]" style={{ color: 'var(--text)' }}>
                                                    {log.profiles?.full_name || 'System Auto'}
                                                </span>
                                                <span className="text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>{log.ip_address || '0.0.0.0'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--border)' }}>
                                        <span className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest inline-block" style={{
                                            background: log.action.includes('delete') ? 'rgba(255, 107, 107, 0.1)' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'rgba(52, 208, 88, 0.1)' :
                                                    log.action.includes('update') ? 'rgba(255, 215, 0, 0.1)' :
                                                        'var(--primary-ghost)',
                                            color: log.action.includes('delete') ? '#ff6b6b' :
                                                log.action.includes('create') || log.action.includes('insert') ? '#34d058' :
                                                    log.action.includes('update') ? '#ffd700' :
                                                        'var(--primary)'
                                        }}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--border)' }}>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-bold text-[11px] tracking-widest uppercase" style={{ color: 'var(--text)' }}>{(log.entity_type || '').replace('_', ' ')}</span>
                                            <div className="inline-flex items-center px-2 py-1 rounded border text-[9px] font-bold uppercase tracking-widest w-fit" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                                                ID: {log.entity_id?.slice(0, 8) || 'N/A'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--border)' }}>
                                        <div className="max-w-[250px] truncate text-[10px] font-mono font-bold px-3 py-2 rounded-lg cursor-help transition-colors" title={JSON.stringify(log.details, null, 2)} style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-2)'}>
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
