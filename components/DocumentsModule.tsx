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
            <div className="bg-white dark:bg-apple-darkCard p-10 rounded-[2.5rem] shadow-sm border border-apple-border dark:border-apple-darkBorder flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
                <div>
                    <h2 className="text-3xl md:text-4xl font-black text-slate-800 dark:text-white tracking-tight leading-tight mb-2">Hujjatlar Kutubxonasi</h2>
                    <p className="text-sm font-semibold text-slate-400">Jami saqlangan hujjatlar: <span className="text-apple-accent">{documents.length}</span></p>
                </div>

                <div className="relative w-full xl:w-[400px] group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-apple-accent transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Hujjat yoki firma nomi..."
                        className="w-full pl-16 pr-8 py-5 bg-slate-50 dark:bg-white/5 border border-apple-border dark:border-apple-darkBorder rounded-2xl outline-none focus:bg-white dark:focus:bg-apple-darkBg shadow-inner font-bold"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="bg-white dark:bg-apple-darkCard h-40 rounded-[2rem] border border-apple-border dark:border-apple-darkBorder animate-pulse"></div>
                    ))
                ) : filtered.length > 0 ? (
                    filtered.map((doc) => {
                        const company = companies.find(c => c.id === doc.company_id);
                        return (
                            <div key={doc.id} className="bg-white dark:bg-apple-darkCard p-8 rounded-[2.5rem] border border-apple-border dark:border-apple-darkBorder group hover:shadow-2xl transition-all relative">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="h-14 w-14 bg-apple-accent/10 rounded-2xl flex items-center justify-center text-apple-accent group-hover:bg-apple-accent group-hover:text-white transition-all">
                                        <FileText size={24} />
                                    </div>
                                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="p-3 bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-apple-accent rounded-xl transition-all">
                                        <Download size={20} />
                                    </a>
                                </div>

                                <h4 className="text-lg font-black text-slate-800 dark:text-white leading-tight mb-4 line-clamp-2" title={doc.file_name}>
                                    {doc.file_name}
                                </h4>

                                <div className="space-y-3 pt-4 border-t border-apple-border dark:border-apple-darkBorder">
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <Building size={14} className="text-apple-accent" />
                                        <span className="text-xs font-bold truncate">{company?.name || "Noma'lum Firma"}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-slate-400">
                                        <Calendar size={14} className="text-apple-accent" />
                                        <span className="text-xs font-bold">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="col-span-full py-32 flex flex-col items-center justify-center text-slate-300">
                        <FileText size={64} className="mb-4 opacity-10" />
                        <p className="font-black uppercase tracking-widest">Hujjatlar topilmadi</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocumentsModule;
