import React, { useEffect, useState } from 'react';

const App: React.FC = () => {
    const [currentUrl, setCurrentUrl] = useState<string>('');
    const [isSupported, setIsSupported] = useState<boolean>(false);

    useEffect(() => {
        // Отримуємо URL поточної активної вкладки
        if (typeof browser !== 'undefined' && browser.tabs) {
            browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                const url = tabs[0]?.url || '';
                setCurrentUrl(url);
                setIsSupported(url.includes('rozetka.com.ua') || url.includes('dnipro-m.ua'));
            });
        }
    }, []);

    return (
        <div className="w-80 p-5 bg-slate-900 text-slate-200 font-sans border border-slate-700 shadow-2xl">
            {/* Шапка */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <span className="text-xl">🕵️‍♂️</span>
                </div>
                <div>
                    <h1 className="text-lg font-black text-white leading-tight">Чесна Ціна</h1>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Fair Price Tracker</p>
                </div>
            </div>

            {/* Блок статусу */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50">
                {isSupported ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-emerald-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            <span className="text-sm font-bold">Сайт підтримується</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Відкрийте сторінку будь-якого товару, і ми автоматично покажемо графік історії цін та перевіримо чесність знижки просто на сторінці.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-amber-400">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            <span className="text-sm font-bold">Сайт не підтримується</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Розширення наразі працює на <b>Rozetka</b> та <b>Dnipro-M</b>. Перейдіть на один із цих магазинів для аналізу цін.
                        </p>
                    </div>
                )}
            </div>

            {/* Футер */}
            <div className="mt-4 pt-3 border-t border-slate-700/50 text-center">
                <p className="text-[10px] text-slate-500">
                    Розроблено для захисту від маніпулятивних знижок.
                </p>
            </div>
        </div>
    );
};

export default App;