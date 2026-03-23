var content = (function() {
	//#region node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
	}
	//#endregion
	//#region src/core/adapters/RozetkaAdapter.ts
	var RozetkaAdapter = class {
		isApplicable(url) {
			return url.includes("rozetka.com.ua");
		}
		getProductID() {
			const urlSkuMatch = window.location.href.match(/p(\d+)/);
			if (urlSkuMatch && urlSkuMatch[1]) {
				console.log("FairPrice: SKU found in URL:", urlSkuMatch[1]);
				return urlSkuMatch[1];
			}
			const skuElement = document.querySelector(".product__code-accent");
			const sku = skuElement ? skuElement.textContent?.trim().replace(/\D/g, "") || null : null;
			console.log("FairPrice: SKU found in DOM:", sku);
			return sku;
		}
		getCurrentPrice() {
			for (const sel of [
				".product-price__big",
				".product-prices__big",
				".price__value",
				"[data-testid=\"price\"]",
				"p.product-prices__big"
			]) {
				const el = document.querySelector(sel);
				if (el) {
					const priceText = el.textContent?.replace(/[^0-9]/g, "");
					if (priceText) {
						console.log("FairPrice: Current Price found:", parseInt(priceText, 10));
						return parseInt(priceText, 10);
					}
				}
			}
			console.warn("FairPrice: Current Price NOT found");
			return null;
		}
		getOriginalPrice() {
			for (const sel of [
				".product-price__small",
				".product-prices__small",
				".price__old",
				"[data-testid=\"old-price\"]",
				"p.product-prices__small"
			]) {
				const el = document.querySelector(sel);
				if (el) {
					const priceText = el.textContent?.replace(/[^0-9]/g, "");
					if (priceText) {
						console.log("FairPrice: Original Price found:", parseInt(priceText, 10));
						return parseInt(priceText, 10);
					}
				}
			}
			return null;
		}
		getTitle() {
			const titleEl = document.querySelector(".product__title") || document.querySelector("h1.product__title");
			return titleEl ? titleEl.textContent?.trim() || null : document.title;
		}
		isInStock() {
			const statusElement = document.querySelector(".status-label");
			if (!statusElement) return true;
			const statusText = statusElement.textContent?.toLowerCase() || "";
			return !statusText.includes("немає в наявності") && !statusText.includes("закінчився");
		}
	};
	//#endregion
	//#region src/core/adapters/DniproMAdapter.ts
	var DniproMAdapter = class {
		productData = null;
		constructor() {
			this.extractJsonLd();
		}
		isApplicable() {
			return window.location.hostname.includes("dnipro-m.ua");
		}
		extractJsonLd() {
			try {
				const scripts = document.querySelectorAll("script[type=\"application/ld+json\"]");
				for (const script of Array.from(scripts)) if (script.textContent && script.textContent.includes("\"@type\": \"Product\"")) {
					const cleanJson = script.textContent.replace(/\\n/g, "").trim();
					const data = JSON.parse(cleanJson);
					if (data && data["@type"] === "Product") {
						this.productData = data;
						console.log("✅ [FairPrice] Успішно завантажено JSON-LD:", this.productData);
						break;
					}
				}
			} catch (e) {
				console.error("❌ [FairPrice] Помилка парсингу JSON-LD:", e);
			}
		}
		getProductID() {
			if (this.productData && this.productData.sku) return this.productData.sku.toString();
			const skuEl = document.querySelector("[data-product-id], .product-code__value");
			let id = skuEl ? skuEl.getAttribute("data-product-id") || skuEl.textContent?.trim() : null;
			if (!id) {
				const urlParts = window.location.pathname.split("/").filter(Boolean);
				id = urlParts[urlParts.length - 1];
			}
			return id || "unknown-product";
		}
		getTitle() {
			if (this.productData && this.productData.name) return this.productData.name;
			const titleEl = document.querySelector("h1, .product-head__title");
			if (titleEl) return titleEl.textContent?.trim() || null;
			return document.title;
		}
		getCurrentPrice() {
			if (this.productData && this.productData.offers && this.productData.offers.price) return parseFloat(this.productData.offers.price);
			const priceEl = document.querySelector(".product-price__current, [itemprop=\"price\"], .price-block__actual, .buy-block__price");
			if (priceEl) {
				const parsed = parseInt(priceEl.textContent?.replace(/\D/g, "") || "0", 10);
				if (parsed > 0) return parsed;
			}
			return null;
		}
		getOriginalPrice() {
			const oldPriceEl = document.querySelector(".product-price__old, .price-block__old");
			if (!oldPriceEl) return null;
			const price = parseInt(oldPriceEl.textContent?.replace(/\D/g, "") || "0", 10);
			return price > 0 ? price : null;
		}
		getStockStatus() {
			if (this.productData && this.productData.offers && this.productData.offers.availability) return this.productData.offers.availability.includes("InStock");
			return document.querySelector(".in-stock--false, .product-status--out-of-stock") ? false : true;
		}
	};
	//#endregion
	//#region src/ui/injector.ts
	/**
	* Injects the Fair Price UI into the current page using Shadow DOM.
	*/
	function injectUI(score, history) {
		console.log("FairPrice: Injecting UI...", score);
		if (document.getElementById("fair-price-root")) return;
		const container = document.createElement("div");
		container.id = "fair-price-root";
		document.body.appendChild(container);
		const shadow = container.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      font-size: 14px;
      z-index: 2147483647; /* Max z-index */
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid #e5e7eb;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-sizing: border-box;
      color: #1f2937;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .title {
      font-weight: 700;
      color: #111827;
      font-size: 16px;
    }
    .score-badge {
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 600;
      color: #fff;
      font-size: 12px;
    }
    .score-good { background-color: #10b981; }
    .score-bad { background-color: #ef4444; }
    .score-neutral { background-color: #f59e0b; }
    
    .chart-container {
      height: 100px;
      background: #f3f4f6;
      border-radius: 8px;
      display: flex;
      align-items: flex-end;
      padding: 8px 4px 0 4px;
      gap: 2px;
      margin-top: 8px;
    }
    .chart-bar {
      flex: 1;
      background-color: #d1d5db;
      border-radius: 2px 2px 0 0;
      transition: height 0.3s ease, background-color 0.2s;
      min-height: 2px;
    }
    .chart-bar:hover {
      background-color: #6b7280;
    }
    .message {
      font-size: 13px;
      color: #4b5563;
      line-height: 1.5;
    }
    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      cursor: pointer;
      font-size: 18px;
      color: #9ca3af;
      border: none;
      background: none;
      padding: 0;
    }
    .close-btn:hover {
      color: #4b5563;
    }
  `;
		shadow.appendChild(style);
		const content = document.createElement("div");
		let scoreClass = "score-neutral";
		if (score.score > 80) scoreClass = "score-good";
		if (score.score < 50) scoreClass = "score-bad";
		content.innerHTML = `
    <button class="close-btn" id="close-widget">×</button>
    <div class="header">
      <span class="title">Fair Price 🇺🇦</span>
      <span class="score-badge ${scoreClass}">${score.score}% Чесності</span>
    </div>
    <div class="message">${score.message}</div>
    <div class="chart-container" id="chart-area" title="Історія цін за останні 60 днів">
      <!-- Bars will be injected here via JS -->
    </div>
  `;
		shadow.appendChild(content);
		shadow.getElementById("close-widget")?.addEventListener("click", () => {
			container.remove();
		});
		const chartArea = shadow.getElementById("chart-area");
		if (chartArea && history.length > 0) {
			const prices = history.map((h) => h.price);
			const maxPrice = Math.max(...prices);
			const minPrice = Math.min(...prices);
			const range = maxPrice - minPrice || 1;
			history.forEach((point) => {
				const bar = document.createElement("div");
				bar.className = "chart-bar";
				const heightPercent = 10 + (point.price - minPrice) / range * 90;
				bar.style.height = `${heightPercent}%`;
				bar.title = `${new Date(point.date).toLocaleDateString()}: ${point.price} ₴`;
				chartArea.appendChild(bar);
			});
		} else if (chartArea) {
			chartArea.textContent = "Немає історії цін";
			chartArea.style.alignItems = "center";
			chartArea.style.justifyContent = "center";
			chartArea.style.color = "#9ca3af";
			chartArea.style.fontSize = "12px";
		}
	}
	//#endregion
	//#region src/entrypoints/content.ts
	var content_default = defineContentScript({
		matches: ["<all_urls>"],
		main() {
			console.log("FairPrice: Content Script Loaded");
			runApp();
			function runApp() {
				const adapters = [new RozetkaAdapter(), new DniproMAdapter()];
				const currentUrl = window.location.href;
				console.log("FairPrice: Analyzing URL:", currentUrl);
				const adapter = adapters.find((a) => a.isApplicable(currentUrl));
				if (!adapter) {
					console.log("FairPrice: No adapter found for this site.");
					return;
				}
				console.log("FairPrice: Adapter found:", adapter.constructor.name);
				extractAndInject(adapter);
				let lastUrl = currentUrl;
				new MutationObserver(() => {
					if (window.location.href !== lastUrl) {
						lastUrl = window.location.href;
						console.log("FairPrice: URL changed, re-checking...");
						extractAndInject(adapter);
					}
				}).observe(document.body, {
					childList: true,
					subtree: true
				});
			}
			async function extractAndInject(adapter) {
				const productId = adapter.getProductID();
				if (!productId) return;
				const currentPrice = adapter.getCurrentPrice();
				if (!currentPrice) return;
				const title = adapter.getTitle();
				if (document.getElementById("fair-price-root")) return;
				console.log("FairPrice: Data found. Requesting analysis...", {
					productId,
					currentPrice
				});
				const payload = {
					url: window.location.href,
					sku: productId,
					currentPrice,
					title: title || document.title
				};
				try {
					const response = await chrome.runtime.sendMessage({
						action: "checkPrice",
						payload
					});
					console.log("FairPrice: Analysis received:", response);
					if (response && response.success) injectUI(response.score, response.history);
					else console.error("Fair Price: Failed to get analysis.", response?.error);
				} catch (e) {
					console.error("Fair Price: Error sending message", e);
				}
			}
		}
	});
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/logger.mjs
	function print$1(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger$1 = {
		debug: (...args) => print$1(console.debug, ...args),
		log: (...args) => print$1(console.log, ...args),
		warn: (...args) => print$1(console.warn, ...args),
		error: (...args) => print$1(console.error, ...args)
	};
	//#endregion
	//#region node_modules/wxt/dist/browser.mjs
	/**
	* Contains the `browser` export which you should use to access the extension
	* APIs in your project:
	*
	* ```ts
	* import { browser } from 'wxt/browser';
	*
	* browser.runtime.onInstalled.addListener(() => {
	*   // ...
	* });
	* ```
	*
	* @module wxt/browser
	*/
	var browser = globalThis.browser?.runtime?.id ? globalThis.browser : globalThis.chrome;
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/custom-events.mjs
	var WxtLocationChangeEvent = class WxtLocationChangeEvent extends Event {
		static EVENT_NAME = getUniqueEventName("wxt:locationchange");
		constructor(newUrl, oldUrl) {
			super(WxtLocationChangeEvent.EVENT_NAME, {});
			this.newUrl = newUrl;
			this.oldUrl = oldUrl;
		}
	};
	/**
	* Returns an event name unique to the extension and content script that's
	* running.
	*/
	function getUniqueEventName(eventName) {
		return `${browser?.runtime?.id}:content:${eventName}`;
	}
	//#endregion
	//#region node_modules/wxt/dist/utils/internal/location-watcher.mjs
	var supportsNavigationApi = typeof globalThis.navigation?.addEventListener === "function";
	/**
	* Create a util that watches for URL changes, dispatching the custom event when
	* detected. Stops watching when content script is invalidated. Uses Navigation
	* API when available, otherwise falls back to polling.
	*/
	function createLocationWatcher(ctx) {
		let lastUrl;
		let watching = false;
		return { run() {
			if (watching) return;
			watching = true;
			lastUrl = new URL(location.href);
			if (supportsNavigationApi) globalThis.navigation.addEventListener("navigate", (event) => {
				const newUrl = new URL(event.destination.url);
				if (newUrl.href === lastUrl.href) return;
				window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
				lastUrl = newUrl;
			}, { signal: ctx.signal });
			else ctx.setInterval(() => {
				const newUrl = new URL(location.href);
				if (newUrl.href !== lastUrl.href) {
					window.dispatchEvent(new WxtLocationChangeEvent(newUrl, lastUrl));
					lastUrl = newUrl;
				}
			}, 1e3);
		} };
	}
	//#endregion
	//#region node_modules/wxt/dist/utils/content-script-context.mjs
	/**
	* Implements
	* [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController).
	* Used to detect and stop content script code when the script is invalidated.
	*
	* It also provides several utilities like `ctx.setTimeout` and
	* `ctx.setInterval` that should be used in content scripts instead of
	* `window.setTimeout` or `window.setInterval`.
	*
	* To create context for testing, you can use the class's constructor:
	*
	* ```ts
	* import { ContentScriptContext } from 'wxt/utils/content-scripts-context';
	*
	* test('storage listener should be removed when context is invalidated', () => {
	*   const ctx = new ContentScriptContext('test');
	*   const item = storage.defineItem('local:count', { defaultValue: 0 });
	*   const watcher = vi.fn();
	*
	*   const unwatch = item.watch(watcher);
	*   ctx.onInvalidated(unwatch); // Listen for invalidate here
	*
	*   await item.setValue(1);
	*   expect(watcher).toBeCalledTimes(1);
	*   expect(watcher).toBeCalledWith(1, 0);
	*
	*   ctx.notifyInvalidated(); // Use this function to invalidate the context
	*   await item.setValue(2);
	*   expect(watcher).toBeCalledTimes(1);
	* });
	* ```
	*/
	var ContentScriptContext = class ContentScriptContext {
		static SCRIPT_STARTED_MESSAGE_TYPE = getUniqueEventName("wxt:content-script-started");
		id;
		abortController;
		locationWatcher = createLocationWatcher(this);
		constructor(contentScriptName, options) {
			this.contentScriptName = contentScriptName;
			this.options = options;
			this.id = Math.random().toString(36).slice(2);
			this.abortController = new AbortController();
			this.stopOldScripts();
			this.listenForNewerScripts();
		}
		get signal() {
			return this.abortController.signal;
		}
		abort(reason) {
			return this.abortController.abort(reason);
		}
		get isInvalid() {
			if (browser.runtime?.id == null) this.notifyInvalidated();
			return this.signal.aborted;
		}
		get isValid() {
			return !this.isInvalid;
		}
		/**
		* Add a listener that is called when the content script's context is
		* invalidated.
		*
		* @example
		*   browser.runtime.onMessage.addListener(cb);
		*   const removeInvalidatedListener = ctx.onInvalidated(() => {
		*     browser.runtime.onMessage.removeListener(cb);
		*   });
		*   // ...
		*   removeInvalidatedListener();
		*
		* @returns A function to remove the listener.
		*/
		onInvalidated(cb) {
			this.signal.addEventListener("abort", cb);
			return () => this.signal.removeEventListener("abort", cb);
		}
		/**
		* Return a promise that never resolves. Useful if you have an async function
		* that shouldn't run after the context is expired.
		*
		* @example
		*   const getValueFromStorage = async () => {
		*     if (ctx.isInvalid) return ctx.block();
		*
		*     // ...
		*   };
		*/
		block() {
			return new Promise(() => {});
		}
		/**
		* Wrapper around `window.setInterval` that automatically clears the interval
		* when invalidated.
		*
		* Intervals can be cleared by calling the normal `clearInterval` function.
		*/
		setInterval(handler, timeout) {
			const id = setInterval(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearInterval(id));
			return id;
		}
		/**
		* Wrapper around `window.setTimeout` that automatically clears the interval
		* when invalidated.
		*
		* Timeouts can be cleared by calling the normal `setTimeout` function.
		*/
		setTimeout(handler, timeout) {
			const id = setTimeout(() => {
				if (this.isValid) handler();
			}, timeout);
			this.onInvalidated(() => clearTimeout(id));
			return id;
		}
		/**
		* Wrapper around `window.requestAnimationFrame` that automatically cancels
		* the request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelAnimationFrame`
		* function.
		*/
		requestAnimationFrame(callback) {
			const id = requestAnimationFrame((...args) => {
				if (this.isValid) callback(...args);
			});
			this.onInvalidated(() => cancelAnimationFrame(id));
			return id;
		}
		/**
		* Wrapper around `window.requestIdleCallback` that automatically cancels the
		* request when invalidated.
		*
		* Callbacks can be canceled by calling the normal `cancelIdleCallback`
		* function.
		*/
		requestIdleCallback(callback, options) {
			const id = requestIdleCallback((...args) => {
				if (!this.signal.aborted) callback(...args);
			}, options);
			this.onInvalidated(() => cancelIdleCallback(id));
			return id;
		}
		addEventListener(target, type, handler, options) {
			if (type === "wxt:locationchange") {
				if (this.isValid) this.locationWatcher.run();
			}
			target.addEventListener?.(type.startsWith("wxt:") ? getUniqueEventName(type) : type, handler, {
				...options,
				signal: this.signal
			});
		}
		/**
		* @internal
		* Abort the abort controller and execute all `onInvalidated` listeners.
		*/
		notifyInvalidated() {
			this.abort("Content script context invalidated");
			logger$1.debug(`Content script "${this.contentScriptName}" context invalidated`);
		}
		stopOldScripts() {
			document.dispatchEvent(new CustomEvent(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, { detail: {
				contentScriptName: this.contentScriptName,
				messageId: this.id
			} }));
			window.postMessage({
				type: ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE,
				contentScriptName: this.contentScriptName,
				messageId: this.id
			}, "*");
		}
		verifyScriptStartedEvent(event) {
			const isSameContentScript = event.detail?.contentScriptName === this.contentScriptName;
			const isFromSelf = event.detail?.messageId === this.id;
			return isSameContentScript && !isFromSelf;
		}
		listenForNewerScripts() {
			const cb = (event) => {
				if (!(event instanceof CustomEvent) || !this.verifyScriptStartedEvent(event)) return;
				this.notifyInvalidated();
			};
			document.addEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb);
			this.onInvalidated(() => document.removeEventListener(ContentScriptContext.SCRIPT_STARTED_MESSAGE_TYPE, cb));
		}
	};
	//#endregion
	//#region \0virtual:wxt-content-script-isolated-world-entrypoint?C:/Users/yuraa/WebstormProjects/fair_price/src/entrypoints/content.ts
	function print(method, ...args) {
		if (typeof args[0] === "string") method(`[wxt] ${args.shift()}`, ...args);
		else method("[wxt]", ...args);
	}
	/** Wrapper around `console` with a "[wxt]" prefix */
	var logger = {
		debug: (...args) => print(console.debug, ...args),
		log: (...args) => print(console.log, ...args),
		warn: (...args) => print(console.warn, ...args),
		error: (...args) => print(console.error, ...args)
	};
	//#endregion
	return (async () => {
		try {
			const { main, ...options } = content_default;
			return await main(new ContentScriptContext("content", options));
		} catch (err) {
			logger.error(`The content script "content" crashed on startup!`, err);
			throw err;
		}
	})();
})();

content;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsIm5hbWVzIjpbInByaW50IiwibG9nZ2VyIiwiYnJvd3NlciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtY29udGVudC1zY3JpcHQubWpzIiwiLi4vLi4vLi4vc3JjL2NvcmUvYWRhcHRlcnMvUm96ZXRrYUFkYXB0ZXIudHMiLCIuLi8uLi8uLi9zcmMvY29yZS9hZGFwdGVycy9Ebmlwcm9NQWRhcHRlci50cyIsIi4uLy4uLy4uL3NyYy91aS9pbmplY3Rvci50cyIsIi4uLy4uLy4uL3NyYy9lbnRyeXBvaW50cy9jb250ZW50LnRzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvZ2dlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzIiwiLi4vLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQubWpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvdXRpbHMvZGVmaW5lLWNvbnRlbnQtc2NyaXB0LnRzXG5mdW5jdGlvbiBkZWZpbmVDb250ZW50U2NyaXB0KGRlZmluaXRpb24pIHtcblx0cmV0dXJuIGRlZmluaXRpb247XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUNvbnRlbnRTY3JpcHQgfTtcbiIsIi8vIEB0cy1ub2NoZWNrXHJcbmltcG9ydCB0eXBlIHsgSVByaWNlQWRhcHRlciB9IGZyb20gJy4vSVByaWNlQWRhcHRlcic7XHJcblxyXG5leHBvcnQgY2xhc3MgUm96ZXRrYUFkYXB0ZXIgaW1wbGVtZW50cyBJUHJpY2VBZGFwdGVyIHtcclxuICBpc0FwcGxpY2FibGUodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIHJldHVybiB1cmwuaW5jbHVkZXMoJ3JvemV0a2EuY29tLnVhJyk7XHJcbiAgfVxyXG5cclxuICBnZXRQcm9kdWN0SUQoKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICAvLyAxLiDQodC/0YDQvtCx0LAg0LcgVVJMXHJcbiAgICBjb25zdCB1cmxTa3VNYXRjaCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmLm1hdGNoKC9wKFxcZCspLyk7XHJcbiAgICBpZiAodXJsU2t1TWF0Y2ggJiYgdXJsU2t1TWF0Y2hbMV0pIHtcclxuICAgICAgY29uc29sZS5sb2coJ0ZhaXJQcmljZTogU0tVIGZvdW5kIGluIFVSTDonLCB1cmxTa3VNYXRjaFsxXSk7XHJcbiAgICAgIHJldHVybiB1cmxTa3VNYXRjaFsxXTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAyLiDQodC/0YDQvtCx0LAg0LcgRE9NXHJcbiAgICBjb25zdCBza3VFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnByb2R1Y3RfX2NvZGUtYWNjZW50Jyk7XHJcbiAgICBjb25zdCBza3UgPSBza3VFbGVtZW50ID8gc2t1RWxlbWVudC50ZXh0Q29udGVudD8udHJpbSgpLnJlcGxhY2UoL1xcRC9nLCAnJykgfHwgbnVsbCA6IG51bGw7XHJcbiAgICBjb25zb2xlLmxvZygnRmFpclByaWNlOiBTS1UgZm91bmQgaW4gRE9NOicsIHNrdSk7XHJcbiAgICByZXR1cm4gc2t1O1xyXG4gIH1cclxuXHJcbiAgZ2V0Q3VycmVudFByaWNlKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgLy8g0J7RgdC90L7QstC90ZYg0YHQtdC70LXQutGC0L7RgNC4INC00LvRjyDRhtGW0L3QuFxyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAnLnByb2R1Y3QtcHJpY2VfX2JpZycsXHJcbiAgICAgICcucHJvZHVjdC1wcmljZXNfX2JpZycsXHJcbiAgICAgICcucHJpY2VfX3ZhbHVlJyxcclxuICAgICAgJ1tkYXRhLXRlc3RpZD1cInByaWNlXCJdJyxcclxuICAgICAgJ3AucHJvZHVjdC1wcmljZXNfX2JpZydcclxuICAgIF07XHJcblxyXG4gICAgZm9yIChjb25zdCBzZWwgb2Ygc2VsZWN0b3JzKSB7XHJcbiAgICAgIGNvbnN0IGVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihzZWwpO1xyXG4gICAgICBpZiAoZWwpIHtcclxuICAgICAgICBjb25zdCBwcmljZVRleHQgPSBlbC50ZXh0Q29udGVudD8ucmVwbGFjZSgvW14wLTldL2csICcnKTtcclxuICAgICAgICBpZiAocHJpY2VUZXh0KSB7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnRmFpclByaWNlOiBDdXJyZW50IFByaWNlIGZvdW5kOicsIHBhcnNlSW50KHByaWNlVGV4dCwgMTApKTtcclxuICAgICAgICAgIHJldHVybiBwYXJzZUludChwcmljZVRleHQsIDEwKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICAgIGNvbnNvbGUud2FybignRmFpclByaWNlOiBDdXJyZW50IFByaWNlIE5PVCBmb3VuZCcpO1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICBnZXRPcmlnaW5hbFByaWNlKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgY29uc3Qgc2VsZWN0b3JzID0gW1xyXG4gICAgICAnLnByb2R1Y3QtcHJpY2VfX3NtYWxsJyxcclxuICAgICAgJy5wcm9kdWN0LXByaWNlc19fc21hbGwnLFxyXG4gICAgICAnLnByaWNlX19vbGQnLFxyXG4gICAgICAnW2RhdGEtdGVzdGlkPVwib2xkLXByaWNlXCJdJyxcclxuICAgICAgJ3AucHJvZHVjdC1wcmljZXNfX3NtYWxsJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHNlbCBvZiBzZWxlY3RvcnMpIHtcclxuICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHNlbCk7XHJcbiAgICAgIGlmIChlbCkge1xyXG4gICAgICAgIGNvbnN0IHByaWNlVGV4dCA9IGVsLnRleHRDb250ZW50Py5yZXBsYWNlKC9bXjAtOV0vZywgJycpO1xyXG4gICAgICAgIGlmIChwcmljZVRleHQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ0ZhaXJQcmljZTogT3JpZ2luYWwgUHJpY2UgZm91bmQ6JywgcGFyc2VJbnQocHJpY2VUZXh0LCAxMCkpO1xyXG4gICAgICAgICAgICByZXR1cm4gcGFyc2VJbnQocHJpY2VUZXh0LCAxMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGdldFRpdGxlKCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgY29uc3QgdGl0bGVFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wcm9kdWN0X190aXRsZScpIHx8IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2gxLnByb2R1Y3RfX3RpdGxlJyk7XHJcbiAgICByZXR1cm4gdGl0bGVFbCA/IHRpdGxlRWwudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBudWxsIDogZG9jdW1lbnQudGl0bGU7XHJcbiAgfVxyXG5cclxuICBpc0luU3RvY2soKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBzdGF0dXNFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnN0YXR1cy1sYWJlbCcpO1xyXG4gICAgaWYgKCFzdGF0dXNFbGVtZW50KSByZXR1cm4gdHJ1ZTsgLy8g0J/RgNC40L/Rg9GB0LrQsNGU0LzQviwg0YnQviDRlCwg0Y/QutGJ0L4g0L3QtdC80LDRlCDQvNGW0YLQutC4XHJcblxyXG4gICAgY29uc3Qgc3RhdHVzVGV4dCA9IHN0YXR1c0VsZW1lbnQudGV4dENvbnRlbnQ/LnRvTG93ZXJDYXNlKCkgfHwgJyc7XHJcbiAgICByZXR1cm4gIXN0YXR1c1RleHQuaW5jbHVkZXMoJ9C90LXQvNCw0ZQg0LIg0L3QsNGP0LLQvdC+0YHRgtGWJykgJiYgIXN0YXR1c1RleHQuaW5jbHVkZXMoJ9C30LDQutGW0L3Rh9C40LLRgdGPJyk7XHJcbiAgfVxyXG59IiwiaW1wb3J0IHsgSVByaWNlQWRhcHRlciB9IGZyb20gJy4vSVByaWNlQWRhcHRlcic7XHJcblxyXG5leHBvcnQgY2xhc3MgRG5pcHJvTUFkYXB0ZXIgaW1wbGVtZW50cyBJUHJpY2VBZGFwdGVyIHtcclxuICAgIHByaXZhdGUgcHJvZHVjdERhdGE6IGFueSA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5leHRyYWN0SnNvbkxkKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNBcHBsaWNhYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUuaW5jbHVkZXMoJ2RuaXByby1tLnVhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g0JLQuNGC0Y/Qs9GD0ZTQvNC+INCz0ZbQtNGA0LDRgtCw0YbRltC50L3RliDQtNCw0L3RliAo0JLQuNC80L7Qs9CwINCi0Jcg4oSWMSlcclxuICAgIHByaXZhdGUgZXh0cmFjdEpzb25MZCgpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzY3JpcHRzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnc2NyaXB0W3R5cGU9XCJhcHBsaWNhdGlvbi9sZCtqc29uXCJdJyk7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2NyaXB0IG9mIEFycmF5LmZyb20oc2NyaXB0cykpIHtcclxuICAgICAgICAgICAgICAgIGlmIChzY3JpcHQudGV4dENvbnRlbnQgJiYgc2NyaXB0LnRleHRDb250ZW50LmluY2x1ZGVzKCdcIkB0eXBlXCI6IFwiUHJvZHVjdFwiJykpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGVhbkpzb24gPSBzY3JpcHQudGV4dENvbnRlbnQucmVwbGFjZSgvXFxcXG4vZywgJycpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShjbGVhbkpzb24pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YSAmJiBkYXRhWydAdHlwZSddID09PSAnUHJvZHVjdCcpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9kdWN0RGF0YSA9IGRhdGE7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgW0ZhaXJQcmljZV0g0KPRgdC/0ZbRiNC90L4g0LfQsNCy0LDQvdGC0LDQttC10L3QviBKU09OLUxEOicsIHRoaXMucHJvZHVjdERhdGEpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhazsgLy8g0JfQvdCw0LnRiNC70Lgg0YLQvtCy0LDRgCDigJQg0LfRg9C/0LjQvdGP0ZTQvNC+INC/0L7RiNGD0LpcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBbRmFpclByaWNlXSDQn9C+0LzQuNC70LrQsCDQv9Cw0YDRgdC40L3Qs9GDIEpTT04tTEQ6JywgZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldFByb2R1Y3RJRCgpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICAvLyDQn9GA0ZbQvtGA0LjRgtC10YIgMTog0J3QsNC00ZbQudC90LjQuSBTS1Ug0Lcg0LHQtdC60LXQvdC00YNcclxuICAgICAgICBpZiAodGhpcy5wcm9kdWN0RGF0YSAmJiB0aGlzLnByb2R1Y3REYXRhLnNrdSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9kdWN0RGF0YS5za3UudG9TdHJpbmcoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vINCf0YDRltC+0YDQuNGC0LXRgiAyOiDQodGC0LDRgNC40Lkg0LfQsNC/0LDRgdC90LjQuSDQstCw0YDRltCw0L3RglxyXG4gICAgICAgIGNvbnN0IHNrdUVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW2RhdGEtcHJvZHVjdC1pZF0sIC5wcm9kdWN0LWNvZGVfX3ZhbHVlJyk7XHJcbiAgICAgICAgbGV0IGlkID0gc2t1RWwgPyBza3VFbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtcHJvZHVjdC1pZCcpIHx8IHNrdUVsLnRleHRDb250ZW50Py50cmltKCkgOiBudWxsO1xyXG4gICAgICAgIGlmICghaWQpIHtcclxuICAgICAgICAgICAgY29uc3QgdXJsUGFydHMgPSB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgICAgICAgICAgIGlkID0gdXJsUGFydHNbdXJsUGFydHMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBpZCB8fCAndW5rbm93bi1wcm9kdWN0JztcclxuICAgIH1cclxuXHJcbiAgICBnZXRUaXRsZSgpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICAvLyDQn9GA0ZbQvtGA0LjRgtC10YIgMTog0JHQtdGA0LXQvNC+INGW0LTQtdCw0LvRjNC90YMg0L3QsNC30LLRgyDQtyBKU09OLUxEXHJcbiAgICAgICAgaWYgKHRoaXMucHJvZHVjdERhdGEgJiYgdGhpcy5wcm9kdWN0RGF0YS5uYW1lKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2R1Y3REYXRhLm5hbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyDQn9GA0ZbQvtGA0LjRgtC10YIgMjog0JfQsNC/0LDRgdC90LjQuSDQstCw0YDRltCw0L3RgiDQtyBIVE1MXHJcbiAgICAgICAgY29uc3QgdGl0bGVFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2gxLCAucHJvZHVjdC1oZWFkX190aXRsZScpO1xyXG4gICAgICAgIGlmICh0aXRsZUVsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aXRsZUVsLnRleHRDb250ZW50Py50cmltKCkgfHwgbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBkb2N1bWVudC50aXRsZTtcclxuICAgIH1cclxuXHJcbiAgICBnZXRDdXJyZW50UHJpY2UoKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgICAgICAgLy8g0J/RgNGW0L7RgNC40YLQtdGCIDE6INCm0ZbQvdCwINC3IEpTT04tTEQgKNC90LDQudGC0L7Rh9C90ZbRiNCwKVxyXG4gICAgICAgIGlmICh0aGlzLnByb2R1Y3REYXRhICYmIHRoaXMucHJvZHVjdERhdGEub2ZmZXJzICYmIHRoaXMucHJvZHVjdERhdGEub2ZmZXJzLnByaWNlKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZUZsb2F0KHRoaXMucHJvZHVjdERhdGEub2ZmZXJzLnByaWNlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vINCf0YDRltC+0YDQuNGC0LXRgiAyOiDQodGC0LDRgNC40Lkg0LfQsNC/0LDRgdC90LjQuSDQstCw0YDRltCw0L3RglxyXG4gICAgICAgIGNvbnN0IHByaWNlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucHJvZHVjdC1wcmljZV9fY3VycmVudCwgW2l0ZW1wcm9wPVwicHJpY2VcIl0sIC5wcmljZS1ibG9ja19fYWN0dWFsLCAuYnV5LWJsb2NrX19wcmljZScpO1xyXG4gICAgICAgIGlmIChwcmljZUVsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlSW50KHByaWNlRWwudGV4dENvbnRlbnQ/LnJlcGxhY2UoL1xcRC9nLCAnJykgfHwgJzAnLCAxMCk7XHJcbiAgICAgICAgICAgIGlmIChwYXJzZWQgPiAwKSByZXR1cm4gcGFyc2VkO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBnZXRPcmlnaW5hbFByaWNlKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgICAgIC8vIEpTT04tTEQg0YHRgtCw0L3QtNCw0YDRgtC90L4g0LzRltGB0YLQuNGC0Ywg0LvQuNGI0LUg0LDQutGC0YPQsNC70YzQvdGDINGG0ZbQvdGDINC/0YDQvtC00LDQttGDIChvZmZlcikuXHJcbiAgICAgICAgLy8g0KLQvtC80YMg0YHRgtCw0YDRgyAo0L/QtdGA0LXQutGA0LXRgdC70LXQvdGDKSDRhtGW0L3RgyDQv9GA0L7QtNC+0LLQttGD0ZTQvNC+INCx0YDQsNGC0Lgg0LcgRE9NLlxyXG4gICAgICAgIGNvbnN0IG9sZFByaWNlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcucHJvZHVjdC1wcmljZV9fb2xkLCAucHJpY2UtYmxvY2tfX29sZCcpO1xyXG4gICAgICAgIGlmICghb2xkUHJpY2VFbCkgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgY29uc3QgcHJpY2UgPSBwYXJzZUludChvbGRQcmljZUVsLnRleHRDb250ZW50Py5yZXBsYWNlKC9cXEQvZywgJycpIHx8ICcwJywgMTApO1xyXG4gICAgICAgIHJldHVybiBwcmljZSA+IDAgPyBwcmljZSA6IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g0J/QtdGA0LXQstGW0YDQutCwINC90LDRj9Cy0L3QvtGB0YLRliAo0JLQuNC80L7Qs9CwINCi0Jcg4oSWNSlcclxuICAgIGdldFN0b2NrU3RhdHVzKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLnByb2R1Y3REYXRhICYmIHRoaXMucHJvZHVjdERhdGEub2ZmZXJzICYmIHRoaXMucHJvZHVjdERhdGEub2ZmZXJzLmF2YWlsYWJpbGl0eSkge1xyXG4gICAgICAgICAgICAvLyBTY2hlbWEub3JnINCy0LjQutC+0YDQuNGB0YLQvtCy0YPRlCAnaHR0cDovL3NjaGVtYS5vcmcvSW5TdG9jaydcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvZHVjdERhdGEub2ZmZXJzLmF2YWlsYWJpbGl0eS5pbmNsdWRlcygnSW5TdG9jaycpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgb3V0T2ZTdG9ja0VsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmluLXN0b2NrLS1mYWxzZSwgLnByb2R1Y3Qtc3RhdHVzLS1vdXQtb2Ytc3RvY2snKTtcclxuICAgICAgICByZXR1cm4gb3V0T2ZTdG9ja0VsID8gZmFsc2UgOiB0cnVlO1xyXG4gICAgfVxyXG59IiwiLyoqXHJcbiAqIEluamVjdHMgdGhlIEZhaXIgUHJpY2UgVUkgaW50byB0aGUgY3VycmVudCBwYWdlIHVzaW5nIFNoYWRvdyBET00uXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5qZWN0VUkoc2NvcmU6IHsgc2NvcmU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nIH0sIGhpc3Rvcnk6IGFueVtdKSB7XHJcbiAgY29uc29sZS5sb2coJ0ZhaXJQcmljZTogSW5qZWN0aW5nIFVJLi4uJywgc2NvcmUpO1xyXG5cclxuICBjb25zdCBleGlzdGluZ1Jvb3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmFpci1wcmljZS1yb290Jyk7XHJcbiAgaWYgKGV4aXN0aW5nUm9vdCkgcmV0dXJuO1xyXG5cclxuICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICBjb250YWluZXIuaWQgPSAnZmFpci1wcmljZS1yb290JztcclxuICAvLyDQktGB0YLQsNCy0LvRj9GU0LzQviDQsiBib2R5XHJcbiAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xyXG5cclxuICBjb25zdCBzaGFkb3cgPSBjb250YWluZXIuYXR0YWNoU2hhZG93KHsgbW9kZTogJ29wZW4nIH0pO1xyXG5cclxuICAvLyBTdHlsZXNcclxuICBjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XHJcbiAgc3R5bGUudGV4dENvbnRlbnQgPSBgXHJcbiAgICA6aG9zdCB7XHJcbiAgICAgIGFsbDogaW5pdGlhbDtcclxuICAgICAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJTZWdvZSBVSVwiLCBSb2JvdG8sIEhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYsIFwiQXBwbGUgQ29sb3IgRW1vamlcIiwgXCJTZWdvZSBVSSBFbW9qaVwiLCBcIlNlZ29lIFVJIFN5bWJvbFwiO1xyXG4gICAgICBmb250LXNpemU6IDE0cHg7XHJcbiAgICAgIHotaW5kZXg6IDIxNDc0ODM2NDc7IC8qIE1heCB6LWluZGV4ICovXHJcbiAgICAgIHBvc2l0aW9uOiBmaXhlZDtcclxuICAgICAgYm90dG9tOiAyMHB4O1xyXG4gICAgICByaWdodDogMjBweDtcclxuICAgICAgd2lkdGg6IDMyMHB4O1xyXG4gICAgICBiYWNrZ3JvdW5kOiAjZmZmZmZmO1xyXG4gICAgICBib3JkZXItcmFkaXVzOiAxMnB4O1xyXG4gICAgICBib3gtc2hhZG93OiAwIDEwcHggMjVweCAtNXB4IHJnYmEoMCwgMCwgMCwgMC4xKSwgMCA4cHggMTBweCAtNnB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcclxuICAgICAgYm9yZGVyOiAxcHggc29saWQgI2U1ZTdlYjtcclxuICAgICAgcGFkZGluZzogMTZweDtcclxuICAgICAgZGlzcGxheTogZmxleDtcclxuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcclxuICAgICAgZ2FwOiAxMnB4O1xyXG4gICAgICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xyXG4gICAgICBjb2xvcjogIzFmMjkzNztcclxuICAgIH1cclxuICAgIC5oZWFkZXIge1xyXG4gICAgICBkaXNwbGF5OiBmbGV4O1xyXG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XHJcbiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7XHJcbiAgICAgIG1hcmdpbi1ib3R0b206IDRweDtcclxuICAgIH1cclxuICAgIC50aXRsZSB7XHJcbiAgICAgIGZvbnQtd2VpZ2h0OiA3MDA7XHJcbiAgICAgIGNvbG9yOiAjMTExODI3O1xyXG4gICAgICBmb250LXNpemU6IDE2cHg7XHJcbiAgICB9XHJcbiAgICAuc2NvcmUtYmFkZ2Uge1xyXG4gICAgICBwYWRkaW5nOiA0cHggMTBweDtcclxuICAgICAgYm9yZGVyLXJhZGl1czogOTk5OXB4O1xyXG4gICAgICBmb250LXdlaWdodDogNjAwO1xyXG4gICAgICBjb2xvcjogI2ZmZjtcclxuICAgICAgZm9udC1zaXplOiAxMnB4O1xyXG4gICAgfVxyXG4gICAgLnNjb3JlLWdvb2QgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjMTBiOTgxOyB9XHJcbiAgICAuc2NvcmUtYmFkIHsgYmFja2dyb3VuZC1jb2xvcjogI2VmNDQ0NDsgfVxyXG4gICAgLnNjb3JlLW5ldXRyYWwgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZjU5ZTBiOyB9XHJcbiAgICBcclxuICAgIC5jaGFydC1jb250YWluZXIge1xyXG4gICAgICBoZWlnaHQ6IDEwMHB4O1xyXG4gICAgICBiYWNrZ3JvdW5kOiAjZjNmNGY2O1xyXG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XHJcbiAgICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICAgIGFsaWduLWl0ZW1zOiBmbGV4LWVuZDtcclxuICAgICAgcGFkZGluZzogOHB4IDRweCAwIDRweDtcclxuICAgICAgZ2FwOiAycHg7XHJcbiAgICAgIG1hcmdpbi10b3A6IDhweDtcclxuICAgIH1cclxuICAgIC5jaGFydC1iYXIge1xyXG4gICAgICBmbGV4OiAxO1xyXG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZDFkNWRiO1xyXG4gICAgICBib3JkZXItcmFkaXVzOiAycHggMnB4IDAgMDtcclxuICAgICAgdHJhbnNpdGlvbjogaGVpZ2h0IDAuM3MgZWFzZSwgYmFja2dyb3VuZC1jb2xvciAwLjJzO1xyXG4gICAgICBtaW4taGVpZ2h0OiAycHg7XHJcbiAgICB9XHJcbiAgICAuY2hhcnQtYmFyOmhvdmVyIHtcclxuICAgICAgYmFja2dyb3VuZC1jb2xvcjogIzZiNzI4MDtcclxuICAgIH1cclxuICAgIC5tZXNzYWdlIHtcclxuICAgICAgZm9udC1zaXplOiAxM3B4O1xyXG4gICAgICBjb2xvcjogIzRiNTU2MztcclxuICAgICAgbGluZS1oZWlnaHQ6IDEuNTtcclxuICAgIH1cclxuICAgIC5jbG9zZS1idG4ge1xyXG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XHJcbiAgICAgIHRvcDogOHB4O1xyXG4gICAgICByaWdodDogOHB4O1xyXG4gICAgICBjdXJzb3I6IHBvaW50ZXI7XHJcbiAgICAgIGZvbnQtc2l6ZTogMThweDtcclxuICAgICAgY29sb3I6ICM5Y2EzYWY7XHJcbiAgICAgIGJvcmRlcjogbm9uZTtcclxuICAgICAgYmFja2dyb3VuZDogbm9uZTtcclxuICAgICAgcGFkZGluZzogMDtcclxuICAgIH1cclxuICAgIC5jbG9zZS1idG46aG92ZXIge1xyXG4gICAgICBjb2xvcjogIzRiNTU2MztcclxuICAgIH1cclxuICBgO1xyXG4gIHNoYWRvdy5hcHBlbmRDaGlsZChzdHlsZSk7XHJcblxyXG4gIC8vIENvbnRlbnRcclxuICBjb25zdCBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgXHJcbiAgLy8gRGV0ZXJtaW5lIHNjb3JlIGNsYXNzXHJcbiAgbGV0IHNjb3JlQ2xhc3MgPSAnc2NvcmUtbmV1dHJhbCc7XHJcbiAgaWYgKHNjb3JlLnNjb3JlID4gODApIHNjb3JlQ2xhc3MgPSAnc2NvcmUtZ29vZCc7XHJcbiAgaWYgKHNjb3JlLnNjb3JlIDwgNTApIHNjb3JlQ2xhc3MgPSAnc2NvcmUtYmFkJztcclxuXHJcbiAgY29udGVudC5pbm5lckhUTUwgPSBgXHJcbiAgICA8YnV0dG9uIGNsYXNzPVwiY2xvc2UtYnRuXCIgaWQ9XCJjbG9zZS13aWRnZXRcIj7DlzwvYnV0dG9uPlxyXG4gICAgPGRpdiBjbGFzcz1cImhlYWRlclwiPlxyXG4gICAgICA8c3BhbiBjbGFzcz1cInRpdGxlXCI+RmFpciBQcmljZSDwn4e68J+Hpjwvc3Bhbj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJzY29yZS1iYWRnZSAke3Njb3JlQ2xhc3N9XCI+JHtzY29yZS5zY29yZX0lINCn0LXRgdC90L7RgdGC0ZY8L3NwYW4+XHJcbiAgICA8L2Rpdj5cclxuICAgIDxkaXYgY2xhc3M9XCJtZXNzYWdlXCI+JHtzY29yZS5tZXNzYWdlfTwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cImNoYXJ0LWNvbnRhaW5lclwiIGlkPVwiY2hhcnQtYXJlYVwiIHRpdGxlPVwi0IbRgdGC0L7RgNGW0Y8g0YbRltC9INC30LAg0L7RgdGC0LDQvdC90ZYgNjAg0LTQvdGW0LJcIj5cclxuICAgICAgPCEtLSBCYXJzIHdpbGwgYmUgaW5qZWN0ZWQgaGVyZSB2aWEgSlMgLS0+XHJcbiAgICA8L2Rpdj5cclxuICBgO1xyXG4gIFxyXG4gIHNoYWRvdy5hcHBlbmRDaGlsZChjb250ZW50KTtcclxuXHJcbiAgLy8gQ2xvc2UgQnV0dG9uIExvZ2ljXHJcbiAgc2hhZG93LmdldEVsZW1lbnRCeUlkKCdjbG9zZS13aWRnZXQnKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICBjb250YWluZXIucmVtb3ZlKCk7XHJcbiAgfSk7XHJcblxyXG4gIC8vIFNpbXBsZSBDaGFydCBMb2dpY1xyXG4gIGNvbnN0IGNoYXJ0QXJlYSA9IHNoYWRvdy5nZXRFbGVtZW50QnlJZCgnY2hhcnQtYXJlYScpO1xyXG4gIGlmIChjaGFydEFyZWEgJiYgaGlzdG9yeS5sZW5ndGggPiAwKSB7XHJcbiAgICAgIGNvbnN0IHByaWNlcyA9IGhpc3RvcnkubWFwKChoOiBhbnkpID0+IGgucHJpY2UpO1xyXG4gICAgICBjb25zdCBtYXhQcmljZSA9IE1hdGgubWF4KC4uLnByaWNlcyk7XHJcbiAgICAgIGNvbnN0IG1pblByaWNlID0gTWF0aC5taW4oLi4ucHJpY2VzKTtcclxuICAgICAgY29uc3QgcmFuZ2UgPSBtYXhQcmljZSAtIG1pblByaWNlIHx8IDE7IC8vIGF2b2lkIGRpdmlkZSBieSB6ZXJvXHJcblxyXG4gICAgICBoaXN0b3J5LmZvckVhY2goKHBvaW50OiBhbnkpID0+IHtcclxuICAgICAgICBjb25zdCBiYXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgICAgICBiYXIuY2xhc3NOYW1lID0gJ2NoYXJ0LWJhcic7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTm9ybWFsaXplIGhlaWdodCBiZXR3ZWVuIDEwJSBhbmQgMTAwJVxyXG4gICAgICAgIGNvbnN0IGhlaWdodFBlcmNlbnQgPSAxMCArICgocG9pbnQucHJpY2UgLSBtaW5QcmljZSkgLyByYW5nZSkgKiA5MDtcclxuICAgICAgICBiYXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0UGVyY2VudH0lYDtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBkYXRlU3RyID0gbmV3IERhdGUocG9pbnQuZGF0ZSkudG9Mb2NhbGVEYXRlU3RyaW5nKCk7XHJcbiAgICAgICAgYmFyLnRpdGxlID0gYCR7ZGF0ZVN0cn06ICR7cG9pbnQucHJpY2V9IOKCtGA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2hhcnRBcmVhLmFwcGVuZENoaWxkKGJhcik7XHJcbiAgICAgIH0pO1xyXG4gIH0gZWxzZSBpZiAoY2hhcnRBcmVhKSB7XHJcbiAgICAgIGNoYXJ0QXJlYS50ZXh0Q29udGVudCA9IFwi0J3QtdC80LDRlCDRltGB0YLQvtGA0ZbRlyDRhtGW0L1cIjtcclxuICAgICAgY2hhcnRBcmVhLnN0eWxlLmFsaWduSXRlbXMgPSBcImNlbnRlclwiO1xyXG4gICAgICBjaGFydEFyZWEuc3R5bGUuanVzdGlmeUNvbnRlbnQgPSBcImNlbnRlclwiO1xyXG4gICAgICBjaGFydEFyZWEuc3R5bGUuY29sb3IgPSBcIiM5Y2EzYWZcIjtcclxuICAgICAgY2hhcnRBcmVhLnN0eWxlLmZvbnRTaXplID0gXCIxMnB4XCI7XHJcbiAgfVxyXG59IiwiLy8gQHRzLW5vY2hlY2tcbmltcG9ydCB7IFJvemV0a2FBZGFwdGVyIH0gZnJvbSAnQC9jb3JlL2FkYXB0ZXJzL1JvemV0a2FBZGFwdGVyJztcbmltcG9ydCB7IERuaXByb01BZGFwdGVyIH0gZnJvbSAnQC9jb3JlL2FkYXB0ZXJzL0RuaXByb01BZGFwdGVyJztcbmltcG9ydCB7IGluamVjdFVJIH0gZnJvbSAnQC91aS9pbmplY3Rvcic7XG5cbmludGVyZmFjZSBQcmljZUNoZWNrUGF5bG9hZCB7XG4gIHVybDogc3RyaW5nO1xuICBza3U6IHN0cmluZztcbiAgY3VycmVudFByaWNlOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDaGVja1ByaWNlUmVzcG9uc2Uge1xuICBzdWNjZXNzOiBib29sZWFuO1xuICBzY29yZTogeyBzY29yZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcgfTtcbiAgaGlzdG9yeTogeyBkYXRlOiBudW1iZXIsIHByaWNlOiBudW1iZXIgfVtdO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29udGVudFNjcmlwdCh7XG4gIG1hdGNoZXM6IFsnPGFsbF91cmxzPiddLFxuICBtYWluKCkge1xuICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBDb250ZW50IFNjcmlwdCBMb2FkZWRcIik7XG4gICAgXG4gICAgLy8gU3RhcnQgYXBwbGljYXRpb24gbG9naWNcbiAgICBydW5BcHAoKTtcblxuICAgIGZ1bmN0aW9uIHJ1bkFwcCgpIHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJzID0gW1xuICAgICAgICBuZXcgUm96ZXRrYUFkYXB0ZXIoKSxcbiAgICAgICAgbmV3IERuaXByb01BZGFwdGVyKClcbiAgICAgIF07XG4gICAgICBjb25zdCBjdXJyZW50VXJsID0gd2luZG93LmxvY2F0aW9uLmhyZWY7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBBbmFseXppbmcgVVJMOlwiLCBjdXJyZW50VXJsKTtcblxuICAgICAgY29uc3QgYWRhcHRlciA9IGFkYXB0ZXJzLmZpbmQoYSA9PiBhLmlzQXBwbGljYWJsZShjdXJyZW50VXJsKSk7XG5cbiAgICAgIGlmICghYWRhcHRlcikge1xuICAgICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogTm8gYWRhcHRlciBmb3VuZCBmb3IgdGhpcyBzaXRlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogQWRhcHRlciBmb3VuZDpcIiwgYWRhcHRlci5jb25zdHJ1Y3Rvci5uYW1lKTtcblxuICAgICAgLy8gSW5pdGlhbCBjaGVja1xuICAgICAgZXh0cmFjdEFuZEluamVjdChhZGFwdGVyKTtcblxuICAgICAgLy8gU2V0IHVwIE11dGF0aW9uT2JzZXJ2ZXIgdG8gaGFuZGxlIFNQQSBuYXZpZ2F0aW9uL3VwZGF0ZXNcbiAgICAgIGxldCBsYXN0VXJsID0gY3VycmVudFVybDtcbiAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLmhyZWYgIT09IGxhc3RVcmwpIHtcbiAgICAgICAgICAgIGxhc3RVcmwgPSB3aW5kb3cubG9jYXRpb24uaHJlZjtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBVUkwgY2hhbmdlZCwgcmUtY2hlY2tpbmcuLi5cIik7XG4gICAgICAgICAgICBleHRyYWN0QW5kSW5qZWN0KGFkYXB0ZXIpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kSW5qZWN0KGFkYXB0ZXI6IGFueSkge1xuICAgICAgY29uc3QgcHJvZHVjdElkID0gYWRhcHRlci5nZXRQcm9kdWN0SUQoKTtcbiAgICAgIGlmICghcHJvZHVjdElkKSByZXR1cm47XG5cbiAgICAgIGNvbnN0IGN1cnJlbnRQcmljZSA9IGFkYXB0ZXIuZ2V0Q3VycmVudFByaWNlKCk7XG4gICAgICBpZiAoIWN1cnJlbnRQcmljZSkgcmV0dXJuO1xuXG4gICAgICBjb25zdCB0aXRsZSA9IGFkYXB0ZXIuZ2V0VGl0bGUoKTtcblxuICAgICAgLy8gQ2hlY2sgaWYgVUkgaXMgYWxyZWFkeSBpbmplY3RlZFxuICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmYWlyLXByaWNlLXJvb3QnKSkgcmV0dXJuO1xuXG4gICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogRGF0YSBmb3VuZC4gUmVxdWVzdGluZyBhbmFseXNpcy4uLlwiLCB7IHByb2R1Y3RJZCwgY3VycmVudFByaWNlIH0pO1xuXG4gICAgICBjb25zdCBwYXlsb2FkOiBQcmljZUNoZWNrUGF5bG9hZCA9IHtcbiAgICAgICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgc2t1OiBwcm9kdWN0SWQsXG4gICAgICAgIGN1cnJlbnRQcmljZSxcbiAgICAgICAgdGl0bGU6IHRpdGxlIHx8IGRvY3VtZW50LnRpdGxlXG4gICAgICB9O1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBTZW5kIGRhdGEgdG8gYmFja2dyb3VuZCBzY3JpcHQgZm9yIGFuYWx5c2lzXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2hyb21lLnJ1bnRpbWUuc2VuZE1lc3NhZ2Uoe1xuICAgICAgICAgICAgYWN0aW9uOiBcImNoZWNrUHJpY2VcIixcbiAgICAgICAgICAgIHBheWxvYWRcbiAgICAgICAgfSkgYXMgQ2hlY2tQcmljZVJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBBbmFseXNpcyByZWNlaXZlZDpcIiwgcmVzcG9uc2UpO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgICBpbmplY3RVSShyZXNwb25zZS5zY29yZSwgcmVzcG9uc2UuaGlzdG9yeSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpciBQcmljZTogRmFpbGVkIHRvIGdldCBhbmFseXNpcy5cIiwgcmVzcG9uc2U/LmVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlyIFByaWNlOiBFcnJvciBzZW5kaW5nIG1lc3NhZ2VcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59KTsiLCIvLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvZ2dlci50c1xuZnVuY3Rpb24gcHJpbnQobWV0aG9kLCAuLi5hcmdzKSB7XG5cdGlmIChpbXBvcnQubWV0YS5lbnYuTU9ERSA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybjtcblx0aWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSBtZXRob2QoYFt3eHRdICR7YXJncy5zaGlmdCgpfWAsIC4uLmFyZ3MpO1xuXHRlbHNlIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xufVxuLyoqIFdyYXBwZXIgYXJvdW5kIGBjb25zb2xlYCB3aXRoIGEgXCJbd3h0XVwiIHByZWZpeCAqL1xuY29uc3QgbG9nZ2VyID0ge1xuXHRkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuXHRsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG5cdHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuXHRlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBsb2dnZXIgfTtcbiIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgYnJvd3NlciQxIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcbi8vI3JlZ2lvbiBzcmMvYnJvd3Nlci50c1xuLyoqXG4qIENvbnRhaW5zIHRoZSBgYnJvd3NlcmAgZXhwb3J0IHdoaWNoIHlvdSBzaG91bGQgdXNlIHRvIGFjY2VzcyB0aGUgZXh0ZW5zaW9uXG4qIEFQSXMgaW4geW91ciBwcm9qZWN0OlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBicm93c2VyIH0gZnJvbSAnd3h0L2Jyb3dzZXInO1xuKlxuKiBicm93c2VyLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuKiAgIC8vIC4uLlxuKiB9KTtcbiogYGBgXG4qXG4qIEBtb2R1bGUgd3h0L2Jyb3dzZXJcbiovXG5jb25zdCBicm93c2VyID0gYnJvd3NlciQxO1xuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBicm93c2VyIH07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMudHNcbnZhciBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50ID0gY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcblx0c3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG5cdGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG5cdFx0c3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG5cdFx0dGhpcy5uZXdVcmwgPSBuZXdVcmw7XG5cdFx0dGhpcy5vbGRVcmwgPSBvbGRVcmw7XG5cdH1cbn07XG4vKipcbiogUmV0dXJucyBhbiBldmVudCBuYW1lIHVuaXF1ZSB0byB0aGUgZXh0ZW5zaW9uIGFuZCBjb250ZW50IHNjcmlwdCB0aGF0J3NcbiogcnVubmluZy5cbiovXG5mdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG5cdHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCwgZ2V0VW5pcXVlRXZlbnROYW1lIH07XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci50c1xuY29uc3Qgc3VwcG9ydHNOYXZpZ2F0aW9uQXBpID0gdHlwZW9mIGdsb2JhbFRoaXMubmF2aWdhdGlvbj8uYWRkRXZlbnRMaXN0ZW5lciA9PT0gXCJmdW5jdGlvblwiO1xuLyoqXG4qIENyZWF0ZSBhIHV0aWwgdGhhdCB3YXRjaGVzIGZvciBVUkwgY2hhbmdlcywgZGlzcGF0Y2hpbmcgdGhlIGN1c3RvbSBldmVudCB3aGVuXG4qIGRldGVjdGVkLiBTdG9wcyB3YXRjaGluZyB3aGVuIGNvbnRlbnQgc2NyaXB0IGlzIGludmFsaWRhdGVkLiBVc2VzIE5hdmlnYXRpb25cbiogQVBJIHdoZW4gYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBwb2xsaW5nLlxuKi9cbmZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcblx0bGV0IGxhc3RVcmw7XG5cdGxldCB3YXRjaGluZyA9IGZhbHNlO1xuXHRyZXR1cm4geyBydW4oKSB7XG5cdFx0aWYgKHdhdGNoaW5nKSByZXR1cm47XG5cdFx0d2F0Y2hpbmcgPSB0cnVlO1xuXHRcdGxhc3RVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdGlmIChzdXBwb3J0c05hdmlnYXRpb25BcGkpIGdsb2JhbFRoaXMubmF2aWdhdGlvbi5hZGRFdmVudExpc3RlbmVyKFwibmF2aWdhdGVcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGV2ZW50LmRlc3RpbmF0aW9uLnVybCk7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgPT09IGxhc3RVcmwuaHJlZikgcmV0dXJuO1xuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRsYXN0VXJsID0gbmV3VXJsO1xuXHRcdH0sIHsgc2lnbmFsOiBjdHguc2lnbmFsIH0pO1xuXHRcdGVsc2UgY3R4LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgIT09IGxhc3RVcmwuaHJlZikge1xuXHRcdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIGxhc3RVcmwpKTtcblx0XHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHRcdH1cblx0XHR9LCAxZTMpO1xuXHR9IH07XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9O1xuIiwiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSBcIi4vaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHsgZ2V0VW5pcXVlRXZlbnROYW1lIH0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5pbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQudHNcbi8qKlxuKiBJbXBsZW1lbnRzXG4qIFtgQWJvcnRDb250cm9sbGVyYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Fib3J0Q29udHJvbGxlcikuXG4qIFVzZWQgdG8gZGV0ZWN0IGFuZCBzdG9wIGNvbnRlbnQgc2NyaXB0IGNvZGUgd2hlbiB0aGUgc2NyaXB0IGlzIGludmFsaWRhdGVkLlxuKlxuKiBJdCBhbHNvIHByb3ZpZGVzIHNldmVyYWwgdXRpbGl0aWVzIGxpa2UgYGN0eC5zZXRUaW1lb3V0YCBhbmRcbiogYGN0eC5zZXRJbnRlcnZhbGAgdGhhdCBzaG91bGQgYmUgdXNlZCBpbiBjb250ZW50IHNjcmlwdHMgaW5zdGVhZCBvZlxuKiBgd2luZG93LnNldFRpbWVvdXRgIG9yIGB3aW5kb3cuc2V0SW50ZXJ2YWxgLlxuKlxuKiBUbyBjcmVhdGUgY29udGV4dCBmb3IgdGVzdGluZywgeW91IGNhbiB1c2UgdGhlIGNsYXNzJ3MgY29uc3RydWN0b3I6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH0gZnJvbSAnd3h0L3V0aWxzL2NvbnRlbnQtc2NyaXB0cy1jb250ZXh0JztcbipcbiogdGVzdCgnc3RvcmFnZSBsaXN0ZW5lciBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQnLCAoKSA9PiB7XG4qICAgY29uc3QgY3R4ID0gbmV3IENvbnRlbnRTY3JpcHRDb250ZXh0KCd0ZXN0Jyk7XG4qICAgY29uc3QgaXRlbSA9IHN0b3JhZ2UuZGVmaW5lSXRlbSgnbG9jYWw6Y291bnQnLCB7IGRlZmF1bHRWYWx1ZTogMCB9KTtcbiogICBjb25zdCB3YXRjaGVyID0gdmkuZm4oKTtcbipcbiogICBjb25zdCB1bndhdGNoID0gaXRlbS53YXRjaCh3YXRjaGVyKTtcbiogICBjdHgub25JbnZhbGlkYXRlZCh1bndhdGNoKTsgLy8gTGlzdGVuIGZvciBpbnZhbGlkYXRlIGhlcmVcbipcbiogICBhd2FpdCBpdGVtLnNldFZhbHVlKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkVGltZXMoMSk7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRXaXRoKDEsIDApO1xuKlxuKiAgIGN0eC5ub3RpZnlJbnZhbGlkYXRlZCgpOyAvLyBVc2UgdGhpcyBmdW5jdGlvbiB0byBpbnZhbGlkYXRlIHRoZSBjb250ZXh0XG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgyKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiB9KTtcbiogYGBgXG4qL1xudmFyIENvbnRlbnRTY3JpcHRDb250ZXh0ID0gY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuXHRzdGF0aWMgU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmNvbnRlbnQtc2NyaXB0LXN0YXJ0ZWRcIik7XG5cdGlkO1xuXHRhYm9ydENvbnRyb2xsZXI7XG5cdGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcblx0Y29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcblx0XHR0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLmlkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMik7XG5cdFx0dGhpcy5hYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0dGhpcy5zdG9wT2xkU2NyaXB0cygpO1xuXHRcdHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG5cdH1cblx0Z2V0IHNpZ25hbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuXHR9XG5cdGFib3J0KHJlYXNvbikge1xuXHRcdHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuXHR9XG5cdGdldCBpc0ludmFsaWQoKSB7XG5cdFx0aWYgKGJyb3dzZXIucnVudGltZT8uaWQgPT0gbnVsbCkgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuXHRcdHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuXHR9XG5cdGdldCBpc1ZhbGlkKCkge1xuXHRcdHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG5cdH1cblx0LyoqXG5cdCogQWRkIGEgbGlzdGVuZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiB0aGUgY29udGVudCBzY3JpcHQncyBjb250ZXh0IGlzXG5cdCogaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG5cdCogICBjb25zdCByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyID0gY3R4Lm9uSW52YWxpZGF0ZWQoKCkgPT4ge1xuXHQqICAgICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcblx0KiAgIH0pO1xuXHQqICAgLy8gLi4uXG5cdCogICByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG5cdCpcblx0KiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGUgbGlzdGVuZXIuXG5cdCovXG5cdG9uSW52YWxpZGF0ZWQoY2IpIHtcblx0XHR0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHRcdHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHR9XG5cdC8qKlxuXHQqIFJldHVybiBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4gVXNlZnVsIGlmIHlvdSBoYXZlIGFuIGFzeW5jIGZ1bmN0aW9uXG5cdCogdGhhdCBzaG91bGRuJ3QgcnVuIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqICAgY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcblx0KiAgICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcblx0KlxuXHQqICAgICAvLyAuLi5cblx0KiAgIH07XG5cdCovXG5cdGJsb2NrKCkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7fSk7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWxcblx0KiB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogSW50ZXJ2YWxzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2xlYXJJbnRlcnZhbGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcblx0XHR9LCB0aW1lb3V0KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsXG5cdCogd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIFRpbWVvdXRzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgc2V0VGltZW91dGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHNcblx0KiB0aGUgcmVxdWVzdCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYFxuXHQqIGZ1bmN0aW9uLlxuXHQqL1xuXHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2FsbGJhY2spIHtcblx0XHRjb25zdCBpZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgY2FsbGJhY2soLi4uYXJncyk7XG5cdFx0fSk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbEFuaW1hdGlvbkZyYW1lKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlXG5cdCogcmVxdWVzdCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbElkbGVDYWxsYmFja2Bcblx0KiBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9LCBvcHRpb25zKTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuXHRcdH1cblx0XHR0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLCBoYW5kbGVyLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0c2lnbmFsOiB0aGlzLnNpZ25hbFxuXHRcdH0pO1xuXHR9XG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuXHQqL1xuXHRub3RpZnlJbnZhbGlkYXRlZCgpIHtcblx0XHR0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcblx0XHRsb2dnZXIuZGVidWcoYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgKTtcblx0fVxuXHRzdG9wT2xkU2NyaXB0cygpIHtcblx0XHRkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIHsgZGV0YWlsOiB7XG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0gfSkpO1xuXHRcdHdpbmRvdy5wb3N0TWVzc2FnZSh7XG5cdFx0XHR0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0sIFwiKlwiKTtcblx0fVxuXHR2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcblx0XHRjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGV0YWlsPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcblx0XHRjb25zdCBpc0Zyb21TZWxmID0gZXZlbnQuZGV0YWlsPy5tZXNzYWdlSWQgPT09IHRoaXMuaWQ7XG5cdFx0cmV0dXJuIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgIWlzRnJvbVNlbGY7XG5cdH1cblx0bGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCkge1xuXHRcdGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEN1c3RvbUV2ZW50KSB8fCAhdGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSByZXR1cm47XG5cdFx0XHR0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0fTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpKTtcblx0fVxufTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgQ29udGVudFNjcmlwdENvbnRleHQgfTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCw1LDYsNyw4LDksMTBdLCJtYXBwaW5ncyI6Ijs7Q0FDQSxTQUFTLG9CQUFvQixZQUFZO0FBQ3hDLFNBQU87Ozs7Q0NDUixJQUFhLGlCQUFiLE1BQXFEO0VBQ25ELGFBQWEsS0FBc0I7QUFDakMsVUFBTyxJQUFJLFNBQVMsaUJBQWlCOztFQUd2QyxlQUE4QjtHQUU1QixNQUFNLGNBQWMsT0FBTyxTQUFTLEtBQUssTUFBTSxTQUFTO0FBQ3hELE9BQUksZUFBZSxZQUFZLElBQUk7QUFDakMsWUFBUSxJQUFJLGdDQUFnQyxZQUFZLEdBQUc7QUFDM0QsV0FBTyxZQUFZOztHQUlyQixNQUFNLGFBQWEsU0FBUyxjQUFjLHdCQUF3QjtHQUNsRSxNQUFNLE1BQU0sYUFBYSxXQUFXLGFBQWEsTUFBTSxDQUFDLFFBQVEsT0FBTyxHQUFHLElBQUksT0FBTztBQUNyRixXQUFRLElBQUksZ0NBQWdDLElBQUk7QUFDaEQsVUFBTzs7RUFHVCxrQkFBaUM7QUFVL0IsUUFBSyxNQUFNLE9BUk87SUFDaEI7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNELEVBRTRCO0lBQzNCLE1BQU0sS0FBSyxTQUFTLGNBQWMsSUFBSTtBQUN0QyxRQUFJLElBQUk7S0FDTixNQUFNLFlBQVksR0FBRyxhQUFhLFFBQVEsV0FBVyxHQUFHO0FBQ3hELFNBQUksV0FBVztBQUNiLGNBQVEsSUFBSSxtQ0FBbUMsU0FBUyxXQUFXLEdBQUcsQ0FBQztBQUN2RSxhQUFPLFNBQVMsV0FBVyxHQUFHOzs7O0FBSXBDLFdBQVEsS0FBSyxxQ0FBcUM7QUFDbEQsVUFBTzs7RUFHVCxtQkFBa0M7QUFTaEMsUUFBSyxNQUFNLE9BUk87SUFDaEI7SUFDQTtJQUNBO0lBQ0E7SUFDQTtJQUNELEVBRTRCO0lBQzNCLE1BQU0sS0FBSyxTQUFTLGNBQWMsSUFBSTtBQUN0QyxRQUFJLElBQUk7S0FDTixNQUFNLFlBQVksR0FBRyxhQUFhLFFBQVEsV0FBVyxHQUFHO0FBQ3hE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