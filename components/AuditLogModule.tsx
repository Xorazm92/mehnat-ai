"use client";
import React, { useState, useEffect } from 'react';
import { Language } from '@/types';
import { Search, Shield, History, User } from 'lucide-react';
import { translations } from '@/lib/translations';

import { getAuditLogs } from '@/server/audit';
import { formatUzDateNumeric, formatUzTime } from '@/lib/format';

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
        try {
            const data = await getAuditLogs();
            if (data) {
                const mapped: AuditLog[] = data.map((log: any) => ({
                    id: log.id,
                    action: log.action,
                    entity_type: log.tableName || '',
                    entity_id: log.recordId || '',
                    details: log.newData || {},
                    user_id: log.userId || '',
                    ip_address: log.ipAddress || '',
                    created_at: log.createdAt ? new Date(log.createdAt).toISOString() : new Date().toISOString(),
                    profiles: log.user ? { full_name: log.user.fullName } : undefined
                }));
                setLogs(mapped);
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        }
        setLoading(false);
    };

    const filteredLogs = logs.filter(log =>
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        log.profiles?.full_name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in p-6 bg-[var(--background)] min-h-dvh">
            {/* Header */}
            <div className="dashboard-card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--primary)] to-[var(--accent-blue-hover)]"></div>
                <div className="flex items-center gap-5 relative z-10">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-inner" style={{ background: 'var(--accent-blue-light)', color: 'var(--accent-blue)' }}>
                        <Shield size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black leading-none uppercase tracking-widest" style={{ color: 'var(--text)' }}>
                            {t.auditLogs}
                        </h2>
                        <p className="text-meta font-bold uppercase tracking-widest mt-2 leading-none" style={{ color: 'var(--text-muted)' }}>
                            {t.auditSub}
                        </p>
                    </div>
                </div>

                <div className="relative w-full md:w-[400px] group/search z-10">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-muted)' }} size={16} />
                    <input
                        type="text"
                        placeholder={t.searchAudit.toUpperCase()}
                        className="w-full pl-11 pr-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest outline-none transition-all focus:ring-2 focus:ring-[var(--primary)] focus:ring-opacity-20 placeholder:text-[var(--text-muted)] shadow-sm"
                        style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text)' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Mobil kartochkalar (Audit) */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="dashboard-card p-12 flex flex-col items-center gap-3">
                        <div className="w-9 h-9 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
                        <p className="text-meta font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{t.loadingAudit}</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="dashboard-card p-12 text-center">
                        <History size={36} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-meta uppercase font-black tracking-[0.2em] opacity-60" style={{ color: 'var(--text-muted)' }}>{t.noDataFound}</span>
                    </div>
                ) : filteredLogs.map((log) => {
                    const isDel = log.action.includes('delete');
                    const isNew = log.action.includes('create') || log.action.includes('insert');
                    const isUpd = log.action.includes('update');
                    const ac = isDel ? 'var(--danger)' : isNew ? 'var(--success)' : isUpd ? 'var(--warning)' : 'var(--accent-blue)';
                    return (
                        <div key={log.id} className="dashboard-card p-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)' }}><User size={15} /></div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-black uppercase tracking-tight truncate" style={{ color: 'var(--text)' }}>{log.profiles?.full_name || 'System Auto'}</div>
                                        <div className="text-micro font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>{formatUzDateNumeric(log.created_at)} {formatUzTime(log.created_at)}</div>
                                    </div>
                                </div>
                                <span className="text-micro font-black uppercase tracking-widest px-2 py-1 rounded-lg shrink-0" style={{ color: ac, background: `${ac}1a` }}>{log.action.replace('_', ' ')}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                <span className="text-micro font-black uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{(log.entity_type || '').replace('_', ' ')}</span>
                                <span className="text-micro font-mono px-1.5 py-0.5 rounded-lg border" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>ID: {log.entity_id?.slice(0, 8) || 'N/A'}</span>
                            </div>
                            <div className="text-micro font-mono mt-2 px-2 py-1.5 rounded-lg truncate" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }} title={JSON.stringify(log.details)}>{JSON.stringify(log.details)}</div>
                        </div>
                    );
                })}
            </div>

            {/* Audit Table (desktop) */}
            <div className="hidden md:block dashboard-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs uppercase tracking-widest">
                        <thead>
                            <tr style={{ background: 'var(--input-bg)', borderBottom: '1px solid var(--card-border)' }}>
                                <th className="px-6 py-4 text-micro font-black leading-none" style={{ color: 'var(--text-muted)' }}>{t.time}</th>
                                <th className="px-6 py-4 text-micro font-black border-l leading-none" style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>{t.user}</th>
                                <th className="px-6 py-4 text-micro font-black border-l leading-none" style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>{t.action}</th>
                                <th className="px-6 py-4 text-micro font-black border-l leading-none" style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>{t.object}</th>
                                <th className="px-6 py-4 text-micro font-black border-l leading-none" style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>{t.details}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y transition-colors">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center border-t" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="flex flex-col items-center justify-center gap-4">
                                            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }}></div>
                                            <p className="text-meta font-bold uppercase tracking-widest animate-pulse" style={{ color: 'var(--text-muted)' }}>{t.loadingAudit}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center border-t" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <History size={48} style={{ color: 'var(--text-muted)' }} className="opacity-50" />
                                            <p className="font-bold uppercase tracking-widest text-meta" style={{ color: 'var(--text-muted)' }}>{t.noDataFound}</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredLogs.map(log => (
                                <tr key={log.id} className="transition-all group hover:bg-[var(--input-bg)]" style={{ borderTop: '1px solid var(--card-border)' }}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-bold text-xs" style={{ color: 'var(--text)' }}>
                                                {formatUzDateNumeric(log.created_at)}
                                            </span>
                                            <span className="text-micro font-bold tabular-nums uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                                {formatUzTime(log.created_at)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'var(--input-bg)', color: 'var(--text-muted)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-blue)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                                <User size={16} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold truncate max-w-[150px] uppercase tracking-widest text-meta" style={{ color: 'var(--text)' }}>
                                                    {log.profiles?.full_name || 'System Auto'}
                                                </span>
                                                <span className="text-micro font-bold uppercase tracking-widest mt-1" style={{ color: 'var(--text-muted)' }}>{log.ip_address || '0.0.0.0'}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--card-border)' }}>
                                        <span className="px-3 py-1.5 rounded-lg text-micro font-black uppercase tracking-widest inline-block" style={{
                                            background: log.action.includes('delete') ? 'color-mix(in srgb, var(--danger) 10%, transparent)' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'color-mix(in srgb, var(--success) 10%, transparent)' :
                                                    log.action.includes('update') ? 'color-mix(in srgb, var(--warning) 10%, transparent)' :
                                                        'var(--accent-blue-light)',
                                            color: log.action.includes('delete') ? 'var(--danger)' :
                                                log.action.includes('create') || log.action.includes('insert') ? 'var(--success)' :
                                                    log.action.includes('update') ? 'var(--warning)' :
                                                        'var(--accent-blue)'
                                        }}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="flex flex-col gap-1.5">
                                            <span className="font-bold text-meta tracking-widest uppercase" style={{ color: 'var(--text)' }}>{(log.entity_type || '').replace('_', ' ')}</span>
                                            <div className="inline-flex items-center px-2 py-1 rounded-lg border text-micro font-bold uppercase tracking-widest w-fit" style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text-muted)' }}>
                                                ID: {log.entity_id?.slice(0, 8) || 'N/A'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-l" style={{ borderColor: 'var(--card-border)' }}>
                                        <div className="max-w-[250px] truncate text-micro font-mono font-bold px-3 py-2 rounded-lg cursor-help transition-colors" title={JSON.stringify(log.details, null, 2)} style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
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
