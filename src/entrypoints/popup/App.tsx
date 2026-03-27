import { useState, useEffect } from 'react';

export default function App() {
    const [activeTab, setActiveTab] = useState<'status' | 'feedback'>('status');
    const [currentUrl, setCurrentUrl] = useState('');
    const [suggestion, setSuggestion] = useState('');
    const [isSent, setIsSent] = useState(false);

    useEffect(() => {
        browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
            setCurrentUrl(tabs[0].url || '');
        });
    }, []);

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
                <h1 className="font-black text-lg tracking-tight">FAIR PRICE</h1>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('status')} className={`text-xs px-2 py-1 rounded ${activeTab === 'status' ? 'bg-white/20' : ''}`}>Статус</button>
                    <button onClick={() => setActiveTab('feedback')} className={`text-xs px-2 py-1 rounded ${activeTab === 'feedback' ? 'bg-white/20' : ''}`}>Допомога</button>
                </div>
            </div>

            <div className="p-4 min-h-[200px]">
                {activeTab === 'status' ? (
                    <div className="space-y-4">
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-slate-400 text-[10px] uppercase font-bold">Поточний сайт</p>
                            <p className="text-sm truncate font-medium text-emerald-400">{new URL(currentUrl || 'about:blank').hostname}</p>
                        </div>
                        {/* Тут можна додати коротку статистику: "Знайдено 12 цін" або "Сайт не підтримується" */}
                        {!currentUrl.includes('rozetka') && !currentUrl.includes('dnipro-m') && (
                            <div className="text-center py-4">
                                <p className="text-xs text-slate-400 mb-3">Ми ще не моніторимо цей магазин</p>
                                <button onClick={() => setActiveTab('feedback')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 px-4 rounded-lg transition-all">
                                    Запропонувати цей сайт
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {isSent ? (
                            <div className="text-center py-8">
                                <p className="text-emerald-400 font-bold">Дякуємо! 🚀</p>
                                <p className="text-xs text-slate-400 mt-2">Ваш запит прийнято в роботу.</p>
                                <button onClick={() => setIsSent(false)} className="mt-4 text-xs underline">Надіслати ще</button>
                            </div>
                        ) : (
                            <>
                                <p className="text-xs text-slate-400">Помітили помилку або хочете додати новий магазин?</p>
                                <textarea
                                    className="w-full bg-slate-800 border border-white/10 rounded-lg p-2 text-xs h-24 focus:border-emerald-500 outline-none"
                                    placeholder="Опишіть проблему або вкажіть назву магазину..."
                                    value={suggestion}
                                    onChange={(e) => setSuggestion(e.target.value)}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => sendFeedback('bug')} className="bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-bold py-2 rounded-lg border border-red-500/20">
                                        ПОВІДОМИТИ ПРО БАГ
                                    </button>
                                    <button onClick={() => sendFeedback('suggestion')} className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-[10px] font-bold py-2 rounded-lg">
                                        ДОДАТИ САЙТ
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