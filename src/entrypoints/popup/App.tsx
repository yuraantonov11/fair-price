import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/utils/i18n';
import { setLanguage, getLanguage, initLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/utils/i18n';

const LANG_LABELS: Record<SupportedLanguage, string> = { en: 'EN', uk: 'UK' };

// ── Alerts Tab ────────────────────────────────────────────────
interface PriceAlert { id: string; targetPrice: number; channel: string; createdAt: string }

const AlertsTab = ({ currentUrl, isSupportedStore }: { currentUrl: string; isSupportedStore: boolean }) => {
    const { t } = useTranslation();
    const [alerts, setAlerts] = useState<PriceAlert[]>([]);
    const [targetPrice, setTargetPrice] = useState('');
    const [channel, setChannel] = useState<'browser' | 'telegram'>('browser');
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [fallbackNote, setFallbackNote] = useState('');

    const loadAlerts = () => {
        if (!currentUrl || !isSupportedStore) return;
        browser.runtime.sendMessage({ type: 'GET_ALERTS', payload: { url: currentUrl } })
            .then((res: any) => { if (res?.success) setAlerts(res.data ?? []); });
    };

    useEffect(loadAlerts, [currentUrl, isSupportedStore]);

    const saveAlert = async () => {
        const price = parseFloat(targetPrice);
        if (!price || price <= 0) return;
        setStatus('saving');
        setFallbackNote('');
        const res: any = await browser.runtime.sendMessage({
            type: 'SAVE_ALERT',
            payload: { url: currentUrl, targetPrice: price, channel },
        });
        if (res?.success) {
            setStatus('saved');
            setTargetPrice('');
            loadAlerts();
            if (res?.data?.fallbackApplied) {
                setFallbackNote(t('popup.alerts.telegramFallback'));
            }
            setTimeout(() => setStatus('idle'), 2500);
        } else {
            setStatus('error');
            setErrorMsg(res?.error ?? 'unknown');
        }
    };

    const deleteAlert = async (alertId: string) => {
        await browser.runtime.sendMessage({ type: 'DELETE_ALERT', payload: { alertId } });
        setAlerts(prev => prev.filter(a => a.id !== alertId));
    };

    if (!isSupportedStore) {
        return (
            <div className="fp-glass p-4 text-center">
                <p className="text-xs text-slate-400">{t('popup.alerts.unsupported')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="fp-glass p-3">
                <p className="fp-title mb-1">{t('popup.alerts.title')}</p>
                <p className="text-[10px] text-slate-400 mb-2">{t('popup.alerts.subtitle')}</p>
                <div className="flex gap-2 mb-2">
                    <select
                        value={channel}
                        onChange={e => setChannel(e.target.value as 'browser' | 'telegram')}
                        className="bg-slate-900/80 border border-white/12 rounded-lg px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-cyan-400"
                    >
                        <option value="browser">{t('popup.alerts.channelBrowser')}</option>
                        <option value="telegram">{t('popup.alerts.channelTelegram')}</option>
                    </select>
                    <span className="text-[10px] text-slate-500 self-center">{t('popup.alerts.channelLabel')}</span>
                </div>

                <div className="flex gap-2">
                    <input
                        type="number"
                        min="1"
                        className="flex-1 bg-slate-900/80 border border-white/12 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400 text-slate-100 placeholder-slate-500"
                        placeholder={t('popup.alerts.targetPricePlaceholder')}
                        value={targetPrice}
                        onChange={e => { setTargetPrice(e.target.value); setStatus('idle'); }}
                    />
                    <button
                        onClick={saveAlert}
                        disabled={status === 'saving' || !targetPrice}
                        className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-900 text-[10px] font-bold px-3 rounded-lg transition-colors whitespace-nowrap"
                    >
                        {status === 'saving' ? t('popup.alerts.saving') : t('popup.alerts.saveBtn')}
                    </button>
                </div>
                {status === 'saved' && <p className="text-[10px] text-emerald-400 mt-1.5">{t('popup.alerts.saved')}</p>}
                {fallbackNote && <p className="text-[10px] text-amber-300 mt-1.5">{fallbackNote}</p>}
                {status === 'error' && <p className="text-[10px] text-rose-400 mt-1.5">{t('popup.alerts.error', { msg: errorMsg })}</p>}
            </div>

            {alerts.length > 0 ? (
                <div className="fp-glass p-3 space-y-1.5">
                    <p className="fp-title mb-1">{t('popup.alerts.activeAlerts')}</p>
                    {alerts.map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                            <span className="text-xs text-slate-200">
                                {t('popup.alerts.below', { price: a.targetPrice })}
                                {' · '}
                                {a.channel === 'telegram' ? t('popup.alerts.channelTelegram') : t('popup.alerts.channelBrowser')}
                            </span>
                            <button
                                onClick={() => deleteAlert(a.id)}
                                className="text-[10px] text-slate-400 hover:text-rose-400 font-bold ml-2 transition-colors"
                            >
                                {t('popup.alerts.deleteBtn')}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-[10px] text-slate-500 text-center py-2">{t('popup.alerts.noAlerts')}</p>
            )}
        </div>
    );
};

// ── Settings Tab ──────────────────────────────────────────────
const SettingsTab = () => {
    const { t } = useTranslation();
    const [affiliateEnabled, setAffiliateEnabled] = useState<boolean>(true);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        browser.runtime.sendMessage({ type: 'GET_CONSENT', payload: {} })
            .then((res: any) => {
                if (res?.success) setAffiliateEnabled(res.affiliateEnabled ?? true);
                setLoaded(true);
            });
    }, []);

    const toggleConsent = async () => {
        const next = !affiliateEnabled;
        setAffiliateEnabled(next);
        await browser.runtime.sendMessage({
            type: 'SET_CONSENT',
            payload: { affiliateEnabled: next },
        });
    };

    if (!loaded) return <div className="flex items-center justify-center py-8"><div className="w-4 h-4 rounded-full border-2 border-cyan-400/50 border-t-cyan-400 animate-spin" /></div>;

    return (
        <div className="space-y-3">
            {/* Affiliate consent */}
            <div className="fp-glass p-3 space-y-2">
                <p className="fp-title">{t('popup.settings.affiliate.title')}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{t('popup.settings.affiliate.description')}</p>
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-300 font-medium">{t('popup.settings.affiliate.toggleLabel')}</span>
                    <button
                        onClick={toggleConsent}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${affiliateEnabled ? 'bg-cyan-500' : 'bg-slate-600'}`}
                        role="switch"
                        aria-checked={affiliateEnabled}
                    >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${affiliateEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                </div>
                <p className={`text-[9px] font-semibold ${affiliateEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {affiliateEnabled ? t('popup.settings.affiliate.enabled') : t('popup.settings.affiliate.disabled')}
                    {' · '}{t('popup.settings.affiliate.note')}
                </p>
            </div>

            {/* Data transparency */}
            <div className="fp-glass p-3 space-y-1.5">
                <p className="fp-title">{t('popup.settings.data.title')}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{t('popup.settings.data.text')}</p>
            </div>

            {/* Privacy policy link */}
            <a
                href="https://github.com/yuraantonov11/fair-price/blob/main/docs/privacy-policy.md"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors py-1"
            >
                {t('popup.settings.privacy')}
            </a>
        </div>
    );
};

// ── Main App ──────────────────────────────────────────────────
export default function App() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'status' | 'alerts' | 'settings'>('status');
    const [currentUrl, setCurrentUrl] = useState('');
    const [suggestion, setSuggestion] = useState('');
    const [isSent, setIsSent] = useState(false);
    const [lang, setLang] = useState<SupportedLanguage>(getLanguage());

    const hostname = (() => {
        try {
            return new URL(currentUrl || 'about:blank').hostname || '—';
        } catch {
            return '—';
        }
    })();

    const isSupportedStore = currentUrl.includes('rozetka') || currentUrl.includes('dnipro-m');

    useEffect(() => {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            setCurrentUrl(tabs[0].url || '');
        });
        initLanguage().then(() => setLang(getLanguage()));
    }, []);

    const handleLang = (l: SupportedLanguage) => {
        void setLanguage(l);
        setLang(l);
    };

    const sendFeedback = async (type: 'suggestion' | 'bug') => {
        await browser.runtime.sendMessage({
            type: 'SEND_FEEDBACK',
            payload: { type, url: currentUrl, comment: suggestion }
        });
        setIsSent(true);
        setSuggestion('');
    };

    return (
        <div className="fair-price-app w-[350px] text-white font-sans overflow-hidden fp-card border-white/10">
            <div className="relative p-3.5 border-b border-white/10 bg-linear-to-r from-cyan-500/65 via-sky-500/55 to-violet-500/65">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_45%)]" />
                <div className="relative flex items-start justify-between gap-2">
                    <div>
                        <h1 className="font-black text-lg tracking-tight leading-none">{t('popup.title')}</h1>
                        <p className="text-[10px] text-white/80 mt-1 uppercase tracking-[0.14em]">v2 · Fair Price</p>
                    </div>
                    <div className="flex gap-0.5 border border-white/25 rounded-md overflow-hidden bg-slate-900/20">
                        {SUPPORTED_LANGUAGES.map(l => (
                            <button
                                key={l}
                                onClick={() => handleLang(l)}
                                className={`text-[10px] px-2 py-1 font-bold transition-colors ${lang === l ? 'bg-white/25 text-white' : 'text-white/70 hover:bg-white/10'}`}
                            >
                                {LANG_LABELS[l]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="relative mt-3 p-1 rounded-lg border border-white/18 bg-slate-900/25 grid grid-cols-3 gap-1">
                    {([
                        ['status',   t('popup.tabs.status')],
                        ['alerts',   t('popup.alerts.tab')],
                        ['settings', t('popup.settings.tab')],
                    ] as const).map(([tab, label]) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`text-[11px] py-1.5 rounded-md font-bold transition-colors ${activeTab === tab ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-3.5 min-h-[228px] bg-slate-900/45">
                {activeTab === 'status' && (
                    <div className="space-y-3">
                        <div className="fp-glass p-3">
                            <p className="fp-title">{t('popup.status.currentSite')}</p>
                            <p className="mt-1 text-sm truncate font-semibold text-cyan-300">{hostname}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            <div className="fp-kpi">
                                <p className="fp-kpi-label">{t('popup.tabs.status')}</p>
                                <p className={`fp-kpi-value ${isSupportedStore ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {isSupportedStore ? t('popup.status.supported') : t('popup.status.limited')}
                                </p>
                            </div>
                            <div className="fp-kpi">
                                <p className="fp-kpi-label">{t('popup.tabs.feedback')}</p>
                                <p className="fp-kpi-value text-slate-200">{t('popup.feedback.alwaysOn')}</p>
                            </div>
                        </div>

                        {!isSupportedStore && (
                            <div className="fp-soft p-3 text-center">
                                <p className="text-xs text-slate-300 mb-2.5">{t('popup.status.unsupported')}</p>
                                <button
                                    onClick={() => {
                                        // inline feedback form fallback
                                        browser.tabs.create({ url: 'https://github.com/yuraantonov11/fair-price/issues' });
                                    }}
                                    className="inline-flex items-center justify-center bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-xs font-bold py-2 px-4 rounded-lg transition-all"
                                >
                                    {t('popup.status.suggestSite')}
                                </button>
                            </div>
                        )}

                        {/* Feedback mini-form inline on status tab */}
                        <div className="fp-glass p-3">
                            <p className="text-[10px] text-slate-400 mb-2">{t('popup.feedback.prompt')}</p>
                            {isSent ? (
                                <div className="text-center py-2">
                                    <p className="text-[10px] text-cyan-300 font-bold">{t('popup.feedback.thanks')}</p>
                                    <button onClick={() => setIsSent(false)} className="text-[9px] text-slate-400 underline mt-1">{t('popup.feedback.sendAnother')}</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <textarea
                                        className="w-full bg-slate-900/80 border border-white/12 rounded-lg p-2 text-xs h-16 focus:border-cyan-400 outline-none resize-none"
                                        placeholder={t('popup.feedback.placeholder')}
                                        value={suggestion}
                                        onChange={e => setSuggestion(e.target.value)}
                                    />
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <button onClick={() => sendFeedback('bug')} className="bg-red-500/20 hover:bg-red-500/30 text-red-300 text-[10px] font-bold py-2 rounded-lg border border-red-500/25">
                                            {t('popup.feedback.reportBug')}
                                        </button>
                                        <button onClick={() => sendFeedback('suggestion')} className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-[10px] font-bold py-2 rounded-lg">
                                            {t('popup.feedback.addSite')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'alerts' && (
                    <AlertsTab currentUrl={currentUrl} isSupportedStore={isSupportedStore} />
                )}

                {activeTab === 'settings' && <SettingsTab />}
            </div>
        </div>
    );
}