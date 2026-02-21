import React, { useState, useEffect } from 'react';
import { Company, Language } from '../types';
import { translations } from '../lib/translations';
import { supabase } from '../lib/supabaseClient';
import { Search, FileText, Download, Calendar, Building } from 'lucide-react';

interface Props {
    companies: Company[];
    lang: Language;
}

const DocumentsModule: React.FC<Props> = ({ companies, lang }) => {
    const t = translations[lang];
    const [search, setSearch] = useState('');
    const [documents, setDocuments] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAllDocs = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('documents')
                .select('*')
                .order('uploaded_at', { ascending: false });

            if (!error && data) {
                setDocuments(data);
            }
            setIsLoading(false);
        };
        fetchAllDocs();
    }, []);

    const filtered = documents.filter(doc => {
        const company = companies.find(c => c.id === doc.company_id);
        const companyName = company?.name || '';
        return doc.file_name.toLowerCase().includes(search.toLowerCase()) ||
            companyName.toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            {/* Library Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2.5rem] md:rounded-[3.5rem] p-6 md:p-12 text-white shadow-glass-lg group">
                <div className="absolute -top-10 -right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-0 right-0 p-12 opacity-[0.05] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none">
                    <FileText size={220} className="hidden md:block" />
                </div>

                <div className="relative z-10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 md:gap-10">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight mb-2 md:mb-4 premium-text-gradient">
                            {t.docLibrary}
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                                {t.totalDocs}: {documents.length}
                            </span>
                        </div>
                    </div>

                    <div className="relative w-full xl:w-[450px] group">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-white transition-colors" size={24} />
                        <input
                            type="text"
                            placeholder={t.searchDoc}
                            className="w-full pl-16 pr-8 py-5 bg-white/5 border border-white/10 rounded-[1.8rem] outline-none focus:bg-white/10 focus:border-white/20 transition-all font-black text-white placeholder:text-white/20 shadow-inner"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="liquid-glass-card h-64 rounded-[3rem] border border-white/10 animate-pulse relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer"></div>
                        </div>
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((doc) => {
                        const company = companies.find(c => c.id === doc.company_id);
                        return (
                            <div key={doc.id} className="liquid-glass-card p-10 rounded-[3rem] group hover:shadow-glass-lg transition-all relative overflow-hidden border border-white/10">
                                <div className="absolute -right-10 -top-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors duration-700"></div>

                                <div className="flex items-start justify-between mb-8">
                                    <div className="h-16 w-16 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 rounded-2xl flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform shadow-glass border border-white/20">
                                        <FileText size={28} />
                                    </div>
                                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="w-12 h-12 flex items-center justify-center bg-white/50 dark:bg-white/5 text-slate-400 hover:bg-emerald-500 hover:text-white rounded-2xl transition-all shadow-glass border border-white/10 transform active:scale-95">
                                        <Download size={20} />
                                    </a>
                                </div>

                                <h4 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-6 line-clamp-2 group-hover:text-indigo-600 transition-colors" title={doc.file_name}>
                                    {doc.file_name}
                                </h4>

                                <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-white/5">
                                    <div className="flex items-center gap-4 text-slate-400 group/item">
                                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center group-hover/item:text-indigo-500 transition-colors">
                                            <Building size={16} />
                                        </div>
                                        <span className="text-[11px] font-black uppercase tracking-widest truncate">{company?.name || t.unknownFirm}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-slate-400 group/item">
                                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center group-hover/item:text-indigo-500 transition-colors">
                                            <Calendar size={16} />
                                        </div>
                                        <span className="text-[11px] font-black uppercase tracking-widest">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="col-span-full py-40 flex flex-col items-center justify-center text-slate-200">
                        <div className="w-24 h-24 rounded-[3.5rem] bg-slate-50 dark:bg-white/5 flex items-center justify-center mb-6 shadow-inner">
                            <FileText size={48} className="opacity-20" />
                        </div>
                        <p className="font-black uppercase tracking-[0.4em] text-xs opacity-40">{t.emptyLibrary}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsModule;
