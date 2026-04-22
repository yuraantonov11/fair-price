import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/utils/i18n';
import { setLanguage, getLanguage, initLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/utils/i18n';

const LANG_LABELS: Record<SupportedLanguage, string> = { en: 'EN', uk: 'UK' };

export default function App() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'status' | 'feedback'>('status');
    const [currentUrl, setCurrentUrl] = useState('');
    const [suggestion, setSuggestion] = useState('');
    const [isSent, setIsSent] = useState(false);
    const [lang, setLang] = useState<SupportedLanguage>(getLanguage());

    useEffect(() => {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            setCurrentUrl(tabs[0].url || '');
        });
        // Load persisted language on popup open
        initLanguage().then(() => setLang(getLanguage()));
    }, []);

    const handleLang = (l: SupportedLanguage) => {
        void setLanguage(l);
        setLang(l);
    };

    const sendFeedback = async (type: 'suggestion' | 'bug') => {
        // Виклик вашого Background скрипта для збереження в Supabase
        await browser.runtime.sendMessage({
            type: 'SEND_FEEDBACK',
            payload: { type, url: currentUrl, comment: suggestion }
        });
        setIsSent(true);
        setSuggestion('');
    };

    return (
        <div className="w-[350px] bg-slate-900 text-white font-sans overflow-hidden shadow-2xl border border-white/10">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-green-600 to-emerald-700 flex justify-between items-center">
                <h1 className="font-black text-lg tracking-tight">{t('popup.title')}</h1>
                <div className="flex gap-2 items-center">
                    {/* Language switcher */}
                    <div className="flex gap-0.5 border border-white/20 rounded-md overflow-hidden">
                        {SUPPORTED_LANGUAGES.map(l => (
                            <button
                                key={l}
                                onClick={() => handleLang(l)}
                                className={`text-[10px] px-2 py-1 font-bold transition-colors ${lang === l ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10'}`}
                            >
                                {LANG_LABELS[l]}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setActiveTab('status')} className={`text-xs px-2 py-1 rounded ${activeTab === 'status' ? 'bg-white/20' : ''}`}>{t('popup.tabs.status')}</button>
                    <button onClick={() => setActiveTab('feedback')} className={`text-xs px-2 py-1 rounded ${activeTab === 'feedback' ? 'bg-white/20' : ''}`}>{t('popup.tabs.feedback')}</button>
                </div>
            </div>

            <div className="p-4 min-h-[200px]">
                {activeTab === 'status' ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-slate-400 text-[10px] uppercase font-bold">{t('popup.status.currentSite')}</p>
                            <p className="text-sm truncate font-medium text-emerald-400">{new URL(currentUrl || 'about:blank').hostname}</p>
                        </div>
                        {/* Тут можна додати коротку статистику: "Знайдено 12 цін" або "Сайт не підтримується" */}
                        {!currentUrl.includes('rozetka') && !currentUrl.includes('dnipro-m') && (
                            <div className="text-center py-4">
                                <p className="text-xs text-slate-400 mb-3">{t('popup.status.unsupported')}</p>
                                <button onClick={() => setActiveTab('feedback')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 px-4 rounded-lg transition-all">
                                    {t('popup.status.suggestSite')}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {isSent ? (
                            <div className="text-center py-8">
                                <p className="text-emerald-400 font-bold">{t('popup.feedback.thanks')}</p>
                                <p className="text-xs text-slate-400 mt-2">{t('popup.feedback.requestReceived')}</p>
                                <button onClick={() => setIsSent(false)} className="mt-4 text-xs underline">{t('popup.feedback.sendAnother')}</button>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-slate-400">{t('popup.feedback.prompt')}</p>
                                <textarea
                                    className="w-full bg-slate-800 border border-white/10 rounded-lg p-2 text-xs h-24 focus:border-emerald-500 outline-none"
                                    placeholder={t('popup.feedback.placeholder')}
                                    value={suggestion}
                                    onChange={(e) => setSuggestion(e.target.value)}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => sendFeedback('bug')} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-bold py-2 rounded-lg border border-red-500/20">
                                        {t('popup.feedback.reportBug')}
                                    </button>
                                    <button onClick={() => sendFeedback('suggestion')} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-[10px] font-bold py-2 rounded-lg">
                                        {t('popup.feedback.addSite')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}