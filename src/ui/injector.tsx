import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { PriceChart } from './PriceChart';

let currentUi: any = null;

export async function injectUI(ctx: any, scoreInfo: { score: number, message: string }, history: any) {
    if (currentUi) {
        currentUi.remove();
    }

    const anchor = document.querySelector('.buy-block, .product-price-box, .product-price') || document.body;

    // @ts-ignore
    currentUi = await createShadowRootUi(ctx, {
        name: 'fair-price-widget',
        position: 'inline',
        anchor: anchor,
        append: 'after',
        // ДОДАЛИ ТИП: container тепер має тип Element
        onMount: (container: Element) => {
            const root = createRoot(container);
            root.render(
                <div className="mt-8 mb-4 p-5 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 w-full max-w-md font-sans">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-black text-slate-800 m-0">Чесна Ціна</h2>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold tracking-wide ${
                            scoreInfo.score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                                scoreInfo.score >= 40 ? 'bg-amber-100 text-amber-700' :
                                    'bg-rose-100 text-rose-700'
                        }`}>
              {scoreInfo.score} / 100
            </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4 leading-relaxed m-0">
                        {scoreInfo.message || 'Аналіз динаміки зміни вартості товару.'}
                    </p>
                    <PriceChart data={history} />
                </div>
            );
            return root;
        },
        // ДОДАЛИ ТИП: root тепер має тип Root (опціонально)
        onRemove: (root?: Root) => {
            root?.unmount();
        },
    });

    currentUi.mount();
}