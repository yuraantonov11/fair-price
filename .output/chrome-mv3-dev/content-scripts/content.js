var content = (function() {
	//#region node_modules/wxt/dist/utils/define-content-script.mjs
	function defineContentScript(definition) {
		return definition;
	}
	//#endregion
	//#region src/adapters/RozetkaAdapter.ts
	var RozetkaAdapter = class {
		isApplicable() {
			return window.location.hostname.includes("rozetka.com.ua");
		}
		getProductID() {
			return null;
		}
		getTitle() {
			return null;
		}
		getCurrentPrice() {
			return null;
		}
		getOriginalPrice() {
			return null;
		}
		getStockStatus() {
			return true;
		}
	};
	//#endregion
	//#region src/adapters/DniproMAdapter.ts
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
						break;
					}
				}
			} catch (e) {
				console.error("FairPrice JSON-LD Error:", e);
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
			return titleEl ? titleEl.textContent?.trim() || null : document.title;
		}
		getCurrentPrice() {
			if (this.productData?.offers?.price) return parseFloat(this.productData.offers.price);
			const priceEl = document.querySelector(".product-price__current, [itemprop=\"price\"], .price-block__actual");
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
			if (this.productData?.offers?.availability) return this.productData.offers.availability.includes("InStock");
			return !document.querySelector(".in-stock--false, .product-status--out-of-stock");
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
				console.log("FairPrice: Analyzing URL:", window.location.href);
				const adapter = adapters.find((a) => a.isApplicable());
				if (!adapter) {
					console.log("FairPrice: No adapter found for this site.");
					return;
				}
				console.log("FairPrice: Adapter found:", adapter.constructor.name);
				extractAndInject(adapter).catch(console.error);
				let lastUrl = window.location.href;
				new MutationObserver(() => {
					if (window.location.href !== lastUrl) {
						lastUrl = window.location.href;
						console.log("FairPrice: URL changed, re-checking...");
						extractAndInject(adapter).catch(console.error);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGVudC5qcyIsIm5hbWVzIjpbInByaW50IiwibG9nZ2VyIiwiYnJvd3NlciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL25vZGVfbW9kdWxlcy93eHQvZGlzdC91dGlscy9kZWZpbmUtY29udGVudC1zY3JpcHQubWpzIiwiLi4vLi4vLi4vc3JjL2FkYXB0ZXJzL1JvemV0a2FBZGFwdGVyLnRzIiwiLi4vLi4vLi4vc3JjL2FkYXB0ZXJzL0RuaXByb01BZGFwdGVyLnRzIiwiLi4vLi4vLi4vc3JjL3VpL2luamVjdG9yLnRzIiwiLi4vLi4vLi4vc3JjL2VudHJ5cG9pbnRzL2NvbnRlbnQudHMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvbG9nZ2VyLm1qcyIsIi4uLy4uLy4uL25vZGVfbW9kdWxlcy9Ad3h0LWRldi9icm93c2VyL3NyYy9pbmRleC5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci5tanMiLCIuLi8uLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvY29udGVudC1zY3JpcHQtY29udGV4dC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8jcmVnaW9uIHNyYy91dGlscy9kZWZpbmUtY29udGVudC1zY3JpcHQudHNcbmZ1bmN0aW9uIGRlZmluZUNvbnRlbnRTY3JpcHQoZGVmaW5pdGlvbikge1xuXHRyZXR1cm4gZGVmaW5pdGlvbjtcbn1cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgZGVmaW5lQ29udGVudFNjcmlwdCB9O1xuIiwiaW1wb3J0IHsgSVByaWNlQWRhcHRlciB9IGZyb20gJy4vSVByaWNlQWRhcHRlcic7XHJcblxyXG5leHBvcnQgY2xhc3MgUm96ZXRrYUFkYXB0ZXIgaW1wbGVtZW50cyBJUHJpY2VBZGFwdGVyIHtcclxuXHJcbiAgLy8g0KbQtdC5INC80LXRgtC+0LQg0YLQtdC/0LXRgCDRltGB0L3Rg9GULCDRliDQv9C+0LzQuNC70LrQsCDQt9C90LjQutC90LUhXHJcbiAgaXNBcHBsaWNhYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhdGlvbi5ob3N0bmFtZS5pbmNsdWRlcygncm96ZXRrYS5jb20udWEnKTtcclxuICB9XHJcblxyXG4gIGdldFByb2R1Y3RJRCgpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgIHJldHVybiBudWxsOyAvLyDQn9C+0LrQuCDRidC+INC30LDQs9C70YPRiNC60LAsINC90LDQv9C40YjQtdC80L4g0L/RltC30L3RltGI0LVcclxuICB9XHJcblxyXG4gIGdldFRpdGxlKCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG5cclxuICBnZXRDdXJyZW50UHJpY2UoKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGdldE9yaWdpbmFsUHJpY2UoKTogbnVtYmVyIHwgbnVsbCB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcblxyXG4gIGdldFN0b2NrU3RhdHVzKCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRydWU7XHJcbiAgfVxyXG59IiwiaW1wb3J0IHsgSVByaWNlQWRhcHRlciB9IGZyb20gJy4vSVByaWNlQWRhcHRlcic7XHJcblxyXG5leHBvcnQgY2xhc3MgRG5pcHJvTUFkYXB0ZXIgaW1wbGVtZW50cyBJUHJpY2VBZGFwdGVyIHtcclxuICAgIHByaXZhdGUgcHJvZHVjdERhdGE6IGFueSA9IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5leHRyYWN0SnNvbkxkKCk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNBcHBsaWNhYmxlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIHJldHVybiB3aW5kb3cubG9jYXRpb24uaG9zdG5hbWUuaW5jbHVkZXMoJ2RuaXByby1tLnVhJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8g0JLQuNGC0Y/Qs9GD0ZTQvNC+INCz0ZbQtNGA0LDRgtCw0YbRltC50L3RliDQtNCw0L3RllxyXG4gICAgcHJpdmF0ZSBleHRyYWN0SnNvbkxkKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdHMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdzY3JpcHRbdHlwZT1cImFwcGxpY2F0aW9uL2xkK2pzb25cIl0nKTtcclxuICAgICAgICAgICAgZm9yIChjb25zdCBzY3JpcHQgb2YgQXJyYXkuZnJvbShzY3JpcHRzKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNjcmlwdC50ZXh0Q29udGVudCAmJiBzY3JpcHQudGV4dENvbnRlbnQuaW5jbHVkZXMoJ1wiQHR5cGVcIjogXCJQcm9kdWN0XCInKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNsZWFuSnNvbiA9IHNjcmlwdC50ZXh0Q29udGVudC5yZXBsYWNlKC9cXFxcbi9nLCAnJykudHJpbSgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGNsZWFuSnNvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkYXRhICYmIGRhdGFbJ0B0eXBlJ10gPT09ICdQcm9kdWN0Jykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2R1Y3REYXRhID0gZGF0YTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlyUHJpY2UgSlNPTi1MRCBFcnJvcjonLCBlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0UHJvZHVjdElEKCk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgICAgIGlmICh0aGlzLnByb2R1Y3REYXRhICYmIHRoaXMucHJvZHVjdERhdGEuc2t1KSByZXR1cm4gdGhpcy5wcm9kdWN0RGF0YS5za3UudG9TdHJpbmcoKTtcclxuICAgICAgICBjb25zdCBza3VFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ1tkYXRhLXByb2R1Y3QtaWRdLCAucHJvZHVjdC1jb2RlX192YWx1ZScpO1xyXG4gICAgICAgIGxldCBpZCA9IHNrdUVsID8gc2t1RWwuZ2V0QXR0cmlidXRlKCdkYXRhLXByb2R1Y3QtaWQnKSB8fCBza3VFbC50ZXh0Q29udGVudD8udHJpbSgpIDogbnVsbDtcclxuICAgICAgICBpZiAoIWlkKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHVybFBhcnRzID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xyXG4gICAgICAgICAgICBpZCA9IHVybFBhcnRzW3VybFBhcnRzLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaWQgfHwgJ3Vua25vd24tcHJvZHVjdCc7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VGl0bGUoKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKHRoaXMucHJvZHVjdERhdGEgJiYgdGhpcy5wcm9kdWN0RGF0YS5uYW1lKSByZXR1cm4gdGhpcy5wcm9kdWN0RGF0YS5uYW1lO1xyXG4gICAgICAgIGNvbnN0IHRpdGxlRWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdoMSwgLnByb2R1Y3QtaGVhZF9fdGl0bGUnKTtcclxuICAgICAgICByZXR1cm4gdGl0bGVFbCA/IHRpdGxlRWwudGV4dENvbnRlbnQ/LnRyaW0oKSB8fCBudWxsIDogZG9jdW1lbnQudGl0bGU7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q3VycmVudFByaWNlKCk6IG51bWJlciB8IG51bGwge1xyXG4gICAgICAgIGlmICh0aGlzLnByb2R1Y3REYXRhPy5vZmZlcnM/LnByaWNlKSByZXR1cm4gcGFyc2VGbG9hdCh0aGlzLnByb2R1Y3REYXRhLm9mZmVycy5wcmljZSk7XHJcbiAgICAgICAgY29uc3QgcHJpY2VFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5wcm9kdWN0LXByaWNlX19jdXJyZW50LCBbaXRlbXByb3A9XCJwcmljZVwiXSwgLnByaWNlLWJsb2NrX19hY3R1YWwnKTtcclxuICAgICAgICBpZiAocHJpY2VFbCkge1xyXG4gICAgICAgICAgICBjb25zdCBwYXJzZWQgPSBwYXJzZUludChwcmljZUVsLnRleHRDb250ZW50Py5yZXBsYWNlKC9cXEQvZywgJycpIHx8ICcwJywgMTApO1xyXG4gICAgICAgICAgICBpZiAocGFyc2VkID4gMCkgcmV0dXJuIHBhcnNlZDtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0T3JpZ2luYWxQcmljZSgpOiBudW1iZXIgfCBudWxsIHtcclxuICAgICAgICBjb25zdCBvbGRQcmljZUVsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnByb2R1Y3QtcHJpY2VfX29sZCwgLnByaWNlLWJsb2NrX19vbGQnKTtcclxuICAgICAgICBpZiAoIW9sZFByaWNlRWwpIHJldHVybiBudWxsO1xyXG4gICAgICAgIGNvbnN0IHByaWNlID0gcGFyc2VJbnQob2xkUHJpY2VFbC50ZXh0Q29udGVudD8ucmVwbGFjZSgvXFxEL2csICcnKSB8fCAnMCcsIDEwKTtcclxuICAgICAgICByZXR1cm4gcHJpY2UgPiAwID8gcHJpY2UgOiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFN0b2NrU3RhdHVzKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGlmICh0aGlzLnByb2R1Y3REYXRhPy5vZmZlcnM/LmF2YWlsYWJpbGl0eSkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9kdWN0RGF0YS5vZmZlcnMuYXZhaWxhYmlsaXR5LmluY2x1ZGVzKCdJblN0b2NrJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IG91dE9mU3RvY2tFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5pbi1zdG9jay0tZmFsc2UsIC5wcm9kdWN0LXN0YXR1cy0tb3V0LW9mLXN0b2NrJyk7XHJcbiAgICAgICAgcmV0dXJuICFvdXRPZlN0b2NrRWw7XHJcbiAgICB9XHJcbn0iLCIvKipcclxuICogSW5qZWN0cyB0aGUgRmFpciBQcmljZSBVSSBpbnRvIHRoZSBjdXJyZW50IHBhZ2UgdXNpbmcgU2hhZG93IERPTS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBpbmplY3RVSShzY29yZTogeyBzY29yZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcgfSwgaGlzdG9yeTogYW55W10pIHtcclxuICBjb25zb2xlLmxvZygnRmFpclByaWNlOiBJbmplY3RpbmcgVUkuLi4nLCBzY29yZSk7XHJcblxyXG4gIGNvbnN0IGV4aXN0aW5nUm9vdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmYWlyLXByaWNlLXJvb3QnKTtcclxuICBpZiAoZXhpc3RpbmdSb290KSByZXR1cm47XHJcblxyXG4gIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gIGNvbnRhaW5lci5pZCA9ICdmYWlyLXByaWNlLXJvb3QnO1xyXG4gIC8vINCS0YHRgtCw0LLQu9GP0ZTQvNC+INCyIGJvZHlcclxuICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XHJcblxyXG4gIGNvbnN0IHNoYWRvdyA9IGNvbnRhaW5lci5hdHRhY2hTaGFkb3coeyBtb2RlOiAnb3BlbicgfSk7XHJcblxyXG4gIC8vIFN0eWxlc1xyXG4gIGNvbnN0IHN0eWxlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtcclxuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcclxuICAgIDpob3N0IHtcclxuICAgICAgYWxsOiBpbml0aWFsO1xyXG4gICAgICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlNlZ29lIFVJXCIsIFJvYm90bywgSGVsdmV0aWNhLCBBcmlhbCwgc2Fucy1zZXJpZiwgXCJBcHBsZSBDb2xvciBFbW9qaVwiLCBcIlNlZ29lIFVJIEVtb2ppXCIsIFwiU2Vnb2UgVUkgU3ltYm9sXCI7XHJcbiAgICAgIGZvbnQtc2l6ZTogMTRweDtcclxuICAgICAgei1pbmRleDogMjE0NzQ4MzY0NzsgLyogTWF4IHotaW5kZXggKi9cclxuICAgICAgcG9zaXRpb246IGZpeGVkO1xyXG4gICAgICBib3R0b206IDIwcHg7XHJcbiAgICAgIHJpZ2h0OiAyMHB4O1xyXG4gICAgICB3aWR0aDogMzIwcHg7XHJcbiAgICAgIGJhY2tncm91bmQ6ICNmZmZmZmY7XHJcbiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7XHJcbiAgICAgIGJveC1zaGFkb3c6IDAgMTBweCAyNXB4IC01cHggcmdiYSgwLCAwLCAwLCAwLjEpLCAwIDhweCAxMHB4IC02cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xyXG4gICAgICBib3JkZXI6IDFweCBzb2xpZCAjZTVlN2ViO1xyXG4gICAgICBwYWRkaW5nOiAxNnB4O1xyXG4gICAgICBkaXNwbGF5OiBmbGV4O1xyXG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xyXG4gICAgICBnYXA6IDEycHg7XHJcbiAgICAgIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XHJcbiAgICAgIGNvbG9yOiAjMWYyOTM3O1xyXG4gICAgfVxyXG4gICAgLmhlYWRlciB7XHJcbiAgICAgIGRpc3BsYXk6IGZsZXg7XHJcbiAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcclxuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcclxuICAgICAgbWFyZ2luLWJvdHRvbTogNHB4O1xyXG4gICAgfVxyXG4gICAgLnRpdGxlIHtcclxuICAgICAgZm9udC13ZWlnaHQ6IDcwMDtcclxuICAgICAgY29sb3I6ICMxMTE4Mjc7XHJcbiAgICAgIGZvbnQtc2l6ZTogMTZweDtcclxuICAgIH1cclxuICAgIC5zY29yZS1iYWRnZSB7XHJcbiAgICAgIHBhZGRpbmc6IDRweCAxMHB4O1xyXG4gICAgICBib3JkZXItcmFkaXVzOiA5OTk5cHg7XHJcbiAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7XHJcbiAgICAgIGNvbG9yOiAjZmZmO1xyXG4gICAgICBmb250LXNpemU6IDEycHg7XHJcbiAgICB9XHJcbiAgICAuc2NvcmUtZ29vZCB7IGJhY2tncm91bmQtY29sb3I6ICMxMGI5ODE7IH1cclxuICAgIC5zY29yZS1iYWQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAjZWY0NDQ0OyB9XHJcbiAgICAuc2NvcmUtbmV1dHJhbCB7IGJhY2tncm91bmQtY29sb3I6ICNmNTllMGI7IH1cclxuICAgIFxyXG4gICAgLmNoYXJ0LWNvbnRhaW5lciB7XHJcbiAgICAgIGhlaWdodDogMTAwcHg7XHJcbiAgICAgIGJhY2tncm91bmQ6ICNmM2Y0ZjY7XHJcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcclxuICAgICAgZGlzcGxheTogZmxleDtcclxuICAgICAgYWxpZ24taXRlbXM6IGZsZXgtZW5kO1xyXG4gICAgICBwYWRkaW5nOiA4cHggNHB4IDAgNHB4O1xyXG4gICAgICBnYXA6IDJweDtcclxuICAgICAgbWFyZ2luLXRvcDogOHB4O1xyXG4gICAgfVxyXG4gICAgLmNoYXJ0LWJhciB7XHJcbiAgICAgIGZsZXg6IDE7XHJcbiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNkMWQ1ZGI7XHJcbiAgICAgIGJvcmRlci1yYWRpdXM6IDJweCAycHggMCAwO1xyXG4gICAgICB0cmFuc2l0aW9uOiBoZWlnaHQgMC4zcyBlYXNlLCBiYWNrZ3JvdW5kLWNvbG9yIDAuMnM7XHJcbiAgICAgIG1pbi1oZWlnaHQ6IDJweDtcclxuICAgIH1cclxuICAgIC5jaGFydC1iYXI6aG92ZXIge1xyXG4gICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjNmI3MjgwO1xyXG4gICAgfVxyXG4gICAgLm1lc3NhZ2Uge1xyXG4gICAgICBmb250LXNpemU6IDEzcHg7XHJcbiAgICAgIGNvbG9yOiAjNGI1NTYzO1xyXG4gICAgICBsaW5lLWhlaWdodDogMS41O1xyXG4gICAgfVxyXG4gICAgLmNsb3NlLWJ0biB7XHJcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcclxuICAgICAgdG9wOiA4cHg7XHJcbiAgICAgIHJpZ2h0OiA4cHg7XHJcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcclxuICAgICAgZm9udC1zaXplOiAxOHB4O1xyXG4gICAgICBjb2xvcjogIzljYTNhZjtcclxuICAgICAgYm9yZGVyOiBub25lO1xyXG4gICAgICBiYWNrZ3JvdW5kOiBub25lO1xyXG4gICAgICBwYWRkaW5nOiAwO1xyXG4gICAgfVxyXG4gICAgLmNsb3NlLWJ0bjpob3ZlciB7XHJcbiAgICAgIGNvbG9yOiAjNGI1NTYzO1xyXG4gICAgfVxyXG4gIGA7XHJcbiAgc2hhZG93LmFwcGVuZENoaWxkKHN0eWxlKTtcclxuXHJcbiAgLy8gQ29udGVudFxyXG4gIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICBcclxuICAvLyBEZXRlcm1pbmUgc2NvcmUgY2xhc3NcclxuICBsZXQgc2NvcmVDbGFzcyA9ICdzY29yZS1uZXV0cmFsJztcclxuICBpZiAoc2NvcmUuc2NvcmUgPiA4MCkgc2NvcmVDbGFzcyA9ICdzY29yZS1nb29kJztcclxuICBpZiAoc2NvcmUuc2NvcmUgPCA1MCkgc2NvcmVDbGFzcyA9ICdzY29yZS1iYWQnO1xyXG5cclxuICBjb250ZW50LmlubmVySFRNTCA9IGBcclxuICAgIDxidXR0b24gY2xhc3M9XCJjbG9zZS1idG5cIiBpZD1cImNsb3NlLXdpZGdldFwiPsOXPC9idXR0b24+XHJcbiAgICA8ZGl2IGNsYXNzPVwiaGVhZGVyXCI+XHJcbiAgICAgIDxzcGFuIGNsYXNzPVwidGl0bGVcIj5GYWlyIFByaWNlIPCfh7rwn4emPC9zcGFuPlxyXG4gICAgICA8c3BhbiBjbGFzcz1cInNjb3JlLWJhZGdlICR7c2NvcmVDbGFzc31cIj4ke3Njb3JlLnNjb3JlfSUg0KfQtdGB0L3QvtGB0YLRljwvc3Bhbj5cclxuICAgIDwvZGl2PlxyXG4gICAgPGRpdiBjbGFzcz1cIm1lc3NhZ2VcIj4ke3Njb3JlLm1lc3NhZ2V9PC9kaXY+XHJcbiAgICA8ZGl2IGNsYXNzPVwiY2hhcnQtY29udGFpbmVyXCIgaWQ9XCJjaGFydC1hcmVhXCIgdGl0bGU9XCLQhtGB0YLQvtGA0ZbRjyDRhtGW0L0g0LfQsCDQvtGB0YLQsNC90L3RliA2MCDQtNC90ZbQslwiPlxyXG4gICAgICA8IS0tIEJhcnMgd2lsbCBiZSBpbmplY3RlZCBoZXJlIHZpYSBKUyAtLT5cclxuICAgIDwvZGl2PlxyXG4gIGA7XHJcbiAgXHJcbiAgc2hhZG93LmFwcGVuZENoaWxkKGNvbnRlbnQpO1xyXG5cclxuICAvLyBDbG9zZSBCdXR0b24gTG9naWNcclxuICBzaGFkb3cuZ2V0RWxlbWVudEJ5SWQoJ2Nsb3NlLXdpZGdldCcpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgIGNvbnRhaW5lci5yZW1vdmUoKTtcclxuICB9KTtcclxuXHJcbiAgLy8gU2ltcGxlIENoYXJ0IExvZ2ljXHJcbiAgY29uc3QgY2hhcnRBcmVhID0gc2hhZG93LmdldEVsZW1lbnRCeUlkKCdjaGFydC1hcmVhJyk7XHJcbiAgaWYgKGNoYXJ0QXJlYSAmJiBoaXN0b3J5Lmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgcHJpY2VzID0gaGlzdG9yeS5tYXAoKGg6IGFueSkgPT4gaC5wcmljZSk7XHJcbiAgICAgIGNvbnN0IG1heFByaWNlID0gTWF0aC5tYXgoLi4ucHJpY2VzKTtcclxuICAgICAgY29uc3QgbWluUHJpY2UgPSBNYXRoLm1pbiguLi5wcmljZXMpO1xyXG4gICAgICBjb25zdCByYW5nZSA9IG1heFByaWNlIC0gbWluUHJpY2UgfHwgMTsgLy8gYXZvaWQgZGl2aWRlIGJ5IHplcm9cclxuXHJcbiAgICAgIGhpc3RvcnkuZm9yRWFjaCgocG9pbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgIGJhci5jbGFzc05hbWUgPSAnY2hhcnQtYmFyJztcclxuICAgICAgICBcclxuICAgICAgICAvLyBOb3JtYWxpemUgaGVpZ2h0IGJldHdlZW4gMTAlIGFuZCAxMDAlXHJcbiAgICAgICAgY29uc3QgaGVpZ2h0UGVyY2VudCA9IDEwICsgKChwb2ludC5wcmljZSAtIG1pblByaWNlKSAvIHJhbmdlKSAqIDkwO1xyXG4gICAgICAgIGJhci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHRQZXJjZW50fSVgO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGRhdGVTdHIgPSBuZXcgRGF0ZShwb2ludC5kYXRlKS50b0xvY2FsZURhdGVTdHJpbmcoKTtcclxuICAgICAgICBiYXIudGl0bGUgPSBgJHtkYXRlU3RyfTogJHtwb2ludC5wcmljZX0g4oK0YDtcclxuICAgICAgICBcclxuICAgICAgICBjaGFydEFyZWEuYXBwZW5kQ2hpbGQoYmFyKTtcclxuICAgICAgfSk7XHJcbiAgfSBlbHNlIGlmIChjaGFydEFyZWEpIHtcclxuICAgICAgY2hhcnRBcmVhLnRleHRDb250ZW50ID0gXCLQndC10LzQsNGUINGW0YHRgtC+0YDRltGXINGG0ZbQvVwiO1xyXG4gICAgICBjaGFydEFyZWEuc3R5bGUuYWxpZ25JdGVtcyA9IFwiY2VudGVyXCI7XHJcbiAgICAgIGNoYXJ0QXJlYS5zdHlsZS5qdXN0aWZ5Q29udGVudCA9IFwiY2VudGVyXCI7XHJcbiAgICAgIGNoYXJ0QXJlYS5zdHlsZS5jb2xvciA9IFwiIzljYTNhZlwiO1xyXG4gICAgICBjaGFydEFyZWEuc3R5bGUuZm9udFNpemUgPSBcIjEycHhcIjtcclxuICB9XHJcbn0iLCJpbXBvcnQgeyBSb3pldGthQWRhcHRlciB9IGZyb20gJ0AvYWRhcHRlcnMvUm96ZXRrYUFkYXB0ZXInO1xuaW1wb3J0IHsgRG5pcHJvTUFkYXB0ZXIgfSBmcm9tICdAL2FkYXB0ZXJzL0RuaXByb01BZGFwdGVyJztcbmltcG9ydCB7IGluamVjdFVJIH0gZnJvbSAnQC91aS9pbmplY3Rvcic7XG5cbmludGVyZmFjZSBQcmljZUNoZWNrUGF5bG9hZCB7XG4gIHVybDogc3RyaW5nO1xuICBza3U6IHN0cmluZztcbiAgY3VycmVudFByaWNlOiBudW1iZXI7XG4gIHRpdGxlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDaGVja1ByaWNlUmVzcG9uc2Uge1xuICBzdWNjZXNzOiBib29sZWFuO1xuICBzY29yZTogeyBzY29yZTogbnVtYmVyLCBtZXNzYWdlOiBzdHJpbmcgfTtcbiAgaGlzdG9yeTogeyBkYXRlOiBudW1iZXIsIHByaWNlOiBudW1iZXIgfVtdO1xuICBlcnJvcj86IHN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29udGVudFNjcmlwdCh7XG4gIG1hdGNoZXM6IFsnPGFsbF91cmxzPiddLFxuICBtYWluKCkge1xuICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBDb250ZW50IFNjcmlwdCBMb2FkZWRcIik7XG5cbiAgICBydW5BcHAoKTtcblxuICAgIGZ1bmN0aW9uIHJ1bkFwcCgpIHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJzID0gW1xuICAgICAgICBuZXcgUm96ZXRrYUFkYXB0ZXIoKSxcbiAgICAgICAgbmV3IERuaXByb01BZGFwdGVyKClcbiAgICAgIF07XG5cbiAgICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBBbmFseXppbmcgVVJMOlwiLCB3aW5kb3cubG9jYXRpb24uaHJlZik7XG5cbiAgICAgIC8vINCS0JjQn9Cg0JDQktCb0JXQndCeOiBpc0FwcGxpY2FibGUoKSDRgtC10L/QtdGAINCy0LjQutC70LjQutCw0ZTRgtGM0YHRjyDQsdC10Lcg0LDRgNCz0YPQvNC10L3RgtGW0LJcbiAgICAgIGNvbnN0IGFkYXB0ZXIgPSBhZGFwdGVycy5maW5kKGEgPT4gYS5pc0FwcGxpY2FibGUoKSk7XG5cbiAgICAgIGlmICghYWRhcHRlcikge1xuICAgICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogTm8gYWRhcHRlciBmb3VuZCBmb3IgdGhpcyBzaXRlLlwiKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogQWRhcHRlciBmb3VuZDpcIiwgYWRhcHRlci5jb25zdHJ1Y3Rvci5uYW1lKTtcblxuICAgICAgZXh0cmFjdEFuZEluamVjdChhZGFwdGVyKS5jYXRjaChjb25zb2xlLmVycm9yKTtcblxuICAgICAgbGV0IGxhc3RVcmwgPSB3aW5kb3cubG9jYXRpb24uaHJlZjtcbiAgICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKCkgPT4ge1xuICAgICAgICBpZiAod2luZG93LmxvY2F0aW9uLmhyZWYgIT09IGxhc3RVcmwpIHtcbiAgICAgICAgICBsYXN0VXJsID0gd2luZG93LmxvY2F0aW9uLmhyZWY7XG4gICAgICAgICAgY29uc29sZS5sb2coXCJGYWlyUHJpY2U6IFVSTCBjaGFuZ2VkLCByZS1jaGVja2luZy4uLlwiKTtcbiAgICAgICAgICBleHRyYWN0QW5kSW5qZWN0KGFkYXB0ZXIpLmNhdGNoKGNvbnNvbGUuZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgb2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5ib2R5LCB7IGNoaWxkTGlzdDogdHJ1ZSwgc3VidHJlZTogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBhc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kSW5qZWN0KGFkYXB0ZXI6IGFueSkge1xuICAgICAgY29uc3QgcHJvZHVjdElkID0gYWRhcHRlci5nZXRQcm9kdWN0SUQoKTtcbiAgICAgIGlmICghcHJvZHVjdElkKSByZXR1cm47XG5cbiAgICAgIGNvbnN0IGN1cnJlbnRQcmljZSA9IGFkYXB0ZXIuZ2V0Q3VycmVudFByaWNlKCk7XG4gICAgICBpZiAoIWN1cnJlbnRQcmljZSkgcmV0dXJuO1xuXG4gICAgICBjb25zdCB0aXRsZSA9IGFkYXB0ZXIuZ2V0VGl0bGUoKTtcblxuICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmYWlyLXByaWNlLXJvb3QnKSkgcmV0dXJuO1xuXG4gICAgICBjb25zb2xlLmxvZyhcIkZhaXJQcmljZTogRGF0YSBmb3VuZC4gUmVxdWVzdGluZyBhbmFseXNpcy4uLlwiLCB7IHByb2R1Y3RJZCwgY3VycmVudFByaWNlIH0pO1xuXG4gICAgICBjb25zdCBwYXlsb2FkOiBQcmljZUNoZWNrUGF5bG9hZCA9IHtcbiAgICAgICAgdXJsOiB3aW5kb3cubG9jYXRpb24uaHJlZixcbiAgICAgICAgc2t1OiBwcm9kdWN0SWQsXG4gICAgICAgIGN1cnJlbnRQcmljZSxcbiAgICAgICAgdGl0bGU6IHRpdGxlIHx8IGRvY3VtZW50LnRpdGxlXG4gICAgICB9O1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNocm9tZS5ydW50aW1lLnNlbmRNZXNzYWdlKHtcbiAgICAgICAgICBhY3Rpb246IFwiY2hlY2tQcmljZVwiLFxuICAgICAgICAgIHBheWxvYWRcbiAgICAgICAgfSkgYXMgQ2hlY2tQcmljZVJlc3BvbnNlO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFwiRmFpclByaWNlOiBBbmFseXNpcyByZWNlaXZlZDpcIiwgcmVzcG9uc2UpO1xuXG4gICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5zdWNjZXNzKSB7XG4gICAgICAgICAgaW5qZWN0VUkocmVzcG9uc2Uuc2NvcmUsIHJlc3BvbnNlLmhpc3RvcnkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlyIFByaWNlOiBGYWlsZWQgdG8gZ2V0IGFuYWx5c2lzLlwiLCByZXNwb25zZT8uZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlyIFByaWNlOiBFcnJvciBzZW5kaW5nIG1lc3NhZ2VcIiwgZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59KTsiLCIvLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2xvZ2dlci50c1xuZnVuY3Rpb24gcHJpbnQobWV0aG9kLCAuLi5hcmdzKSB7XG5cdGlmIChpbXBvcnQubWV0YS5lbnYuTU9ERSA9PT0gXCJwcm9kdWN0aW9uXCIpIHJldHVybjtcblx0aWYgKHR5cGVvZiBhcmdzWzBdID09PSBcInN0cmluZ1wiKSBtZXRob2QoYFt3eHRdICR7YXJncy5zaGlmdCgpfWAsIC4uLmFyZ3MpO1xuXHRlbHNlIG1ldGhvZChcIlt3eHRdXCIsIC4uLmFyZ3MpO1xufVxuLyoqIFdyYXBwZXIgYXJvdW5kIGBjb25zb2xlYCB3aXRoIGEgXCJbd3h0XVwiIHByZWZpeCAqL1xuY29uc3QgbG9nZ2VyID0ge1xuXHRkZWJ1ZzogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZGVidWcsIC4uLmFyZ3MpLFxuXHRsb2c6ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLmxvZywgLi4uYXJncyksXG5cdHdhcm46ICguLi5hcmdzKSA9PiBwcmludChjb25zb2xlLndhcm4sIC4uLmFyZ3MpLFxuXHRlcnJvcjogKC4uLmFyZ3MpID0+IHByaW50KGNvbnNvbGUuZXJyb3IsIC4uLmFyZ3MpXG59O1xuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBsb2dnZXIgfTtcbiIsIi8vICNyZWdpb24gc25pcHBldFxuZXhwb3J0IGNvbnN0IGJyb3dzZXIgPSBnbG9iYWxUaGlzLmJyb3dzZXI/LnJ1bnRpbWU/LmlkXG4gID8gZ2xvYmFsVGhpcy5icm93c2VyXG4gIDogZ2xvYmFsVGhpcy5jaHJvbWU7XG4vLyAjZW5kcmVnaW9uIHNuaXBwZXRcbiIsImltcG9ydCB7IGJyb3dzZXIgYXMgYnJvd3NlciQxIH0gZnJvbSBcIkB3eHQtZGV2L2Jyb3dzZXJcIjtcbi8vI3JlZ2lvbiBzcmMvYnJvd3Nlci50c1xuLyoqXG4qIENvbnRhaW5zIHRoZSBgYnJvd3NlcmAgZXhwb3J0IHdoaWNoIHlvdSBzaG91bGQgdXNlIHRvIGFjY2VzcyB0aGUgZXh0ZW5zaW9uXG4qIEFQSXMgaW4geW91ciBwcm9qZWN0OlxuKlxuKiBgYGB0c1xuKiBpbXBvcnQgeyBicm93c2VyIH0gZnJvbSAnd3h0L2Jyb3dzZXInO1xuKlxuKiBicm93c2VyLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoKCkgPT4ge1xuKiAgIC8vIC4uLlxuKiB9KTtcbiogYGBgXG4qXG4qIEBtb2R1bGUgd3h0L2Jyb3dzZXJcbiovXG5jb25zdCBicm93c2VyID0gYnJvd3NlciQxO1xuLy8jZW5kcmVnaW9uXG5leHBvcnQgeyBicm93c2VyIH07XG4iLCJpbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL3V0aWxzL2ludGVybmFsL2N1c3RvbS1ldmVudHMudHNcbnZhciBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50ID0gY2xhc3MgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCBleHRlbmRzIEV2ZW50IHtcblx0c3RhdGljIEVWRU5UX05BTUUgPSBnZXRVbmlxdWVFdmVudE5hbWUoXCJ3eHQ6bG9jYXRpb25jaGFuZ2VcIik7XG5cdGNvbnN0cnVjdG9yKG5ld1VybCwgb2xkVXJsKSB7XG5cdFx0c3VwZXIoV3h0TG9jYXRpb25DaGFuZ2VFdmVudC5FVkVOVF9OQU1FLCB7fSk7XG5cdFx0dGhpcy5uZXdVcmwgPSBuZXdVcmw7XG5cdFx0dGhpcy5vbGRVcmwgPSBvbGRVcmw7XG5cdH1cbn07XG4vKipcbiogUmV0dXJucyBhbiBldmVudCBuYW1lIHVuaXF1ZSB0byB0aGUgZXh0ZW5zaW9uIGFuZCBjb250ZW50IHNjcmlwdCB0aGF0J3NcbiogcnVubmluZy5cbiovXG5mdW5jdGlvbiBnZXRVbmlxdWVFdmVudE5hbWUoZXZlbnROYW1lKSB7XG5cdHJldHVybiBgJHticm93c2VyPy5ydW50aW1lPy5pZH06JHtpbXBvcnQubWV0YS5lbnYuRU5UUllQT0lOVH06JHtldmVudE5hbWV9YDtcbn1cbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgV3h0TG9jYXRpb25DaGFuZ2VFdmVudCwgZ2V0VW5pcXVlRXZlbnROYW1lIH07XG4iLCJpbXBvcnQgeyBXeHRMb2NhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSBcIi4vY3VzdG9tLWV2ZW50cy5tanNcIjtcbi8vI3JlZ2lvbiBzcmMvdXRpbHMvaW50ZXJuYWwvbG9jYXRpb24td2F0Y2hlci50c1xuY29uc3Qgc3VwcG9ydHNOYXZpZ2F0aW9uQXBpID0gdHlwZW9mIGdsb2JhbFRoaXMubmF2aWdhdGlvbj8uYWRkRXZlbnRMaXN0ZW5lciA9PT0gXCJmdW5jdGlvblwiO1xuLyoqXG4qIENyZWF0ZSBhIHV0aWwgdGhhdCB3YXRjaGVzIGZvciBVUkwgY2hhbmdlcywgZGlzcGF0Y2hpbmcgdGhlIGN1c3RvbSBldmVudCB3aGVuXG4qIGRldGVjdGVkLiBTdG9wcyB3YXRjaGluZyB3aGVuIGNvbnRlbnQgc2NyaXB0IGlzIGludmFsaWRhdGVkLiBVc2VzIE5hdmlnYXRpb25cbiogQVBJIHdoZW4gYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBwb2xsaW5nLlxuKi9cbmZ1bmN0aW9uIGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcihjdHgpIHtcblx0bGV0IGxhc3RVcmw7XG5cdGxldCB3YXRjaGluZyA9IGZhbHNlO1xuXHRyZXR1cm4geyBydW4oKSB7XG5cdFx0aWYgKHdhdGNoaW5nKSByZXR1cm47XG5cdFx0d2F0Y2hpbmcgPSB0cnVlO1xuXHRcdGxhc3RVcmwgPSBuZXcgVVJMKGxvY2F0aW9uLmhyZWYpO1xuXHRcdGlmIChzdXBwb3J0c05hdmlnYXRpb25BcGkpIGdsb2JhbFRoaXMubmF2aWdhdGlvbi5hZGRFdmVudExpc3RlbmVyKFwibmF2aWdhdGVcIiwgKGV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBuZXdVcmwgPSBuZXcgVVJMKGV2ZW50LmRlc3RpbmF0aW9uLnVybCk7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgPT09IGxhc3RVcmwuaHJlZikgcmV0dXJuO1xuXHRcdFx0d2luZG93LmRpc3BhdGNoRXZlbnQobmV3IFd4dExvY2F0aW9uQ2hhbmdlRXZlbnQobmV3VXJsLCBsYXN0VXJsKSk7XG5cdFx0XHRsYXN0VXJsID0gbmV3VXJsO1xuXHRcdH0sIHsgc2lnbmFsOiBjdHguc2lnbmFsIH0pO1xuXHRcdGVsc2UgY3R4LnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1VybCA9IG5ldyBVUkwobG9jYXRpb24uaHJlZik7XG5cdFx0XHRpZiAobmV3VXJsLmhyZWYgIT09IGxhc3RVcmwuaHJlZikge1xuXHRcdFx0XHR3aW5kb3cuZGlzcGF0Y2hFdmVudChuZXcgV3h0TG9jYXRpb25DaGFuZ2VFdmVudChuZXdVcmwsIGxhc3RVcmwpKTtcblx0XHRcdFx0bGFzdFVybCA9IG5ld1VybDtcblx0XHRcdH1cblx0XHR9LCAxZTMpO1xuXHR9IH07XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9O1xuIiwiaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSBcIi4vaW50ZXJuYWwvbG9nZ2VyLm1qc1wiO1xuaW1wb3J0IHsgZ2V0VW5pcXVlRXZlbnROYW1lIH0gZnJvbSBcIi4vaW50ZXJuYWwvY3VzdG9tLWV2ZW50cy5tanNcIjtcbmltcG9ydCB7IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlciB9IGZyb20gXCIuL2ludGVybmFsL2xvY2F0aW9uLXdhdGNoZXIubWpzXCI7XG5pbXBvcnQgeyBicm93c2VyIH0gZnJvbSBcInd4dC9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL3V0aWxzL2NvbnRlbnQtc2NyaXB0LWNvbnRleHQudHNcbi8qKlxuKiBJbXBsZW1lbnRzXG4qIFtgQWJvcnRDb250cm9sbGVyYF0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0Fib3J0Q29udHJvbGxlcikuXG4qIFVzZWQgdG8gZGV0ZWN0IGFuZCBzdG9wIGNvbnRlbnQgc2NyaXB0IGNvZGUgd2hlbiB0aGUgc2NyaXB0IGlzIGludmFsaWRhdGVkLlxuKlxuKiBJdCBhbHNvIHByb3ZpZGVzIHNldmVyYWwgdXRpbGl0aWVzIGxpa2UgYGN0eC5zZXRUaW1lb3V0YCBhbmRcbiogYGN0eC5zZXRJbnRlcnZhbGAgdGhhdCBzaG91bGQgYmUgdXNlZCBpbiBjb250ZW50IHNjcmlwdHMgaW5zdGVhZCBvZlxuKiBgd2luZG93LnNldFRpbWVvdXRgIG9yIGB3aW5kb3cuc2V0SW50ZXJ2YWxgLlxuKlxuKiBUbyBjcmVhdGUgY29udGV4dCBmb3IgdGVzdGluZywgeW91IGNhbiB1c2UgdGhlIGNsYXNzJ3MgY29uc3RydWN0b3I6XG4qXG4qIGBgYHRzXG4qIGltcG9ydCB7IENvbnRlbnRTY3JpcHRDb250ZXh0IH0gZnJvbSAnd3h0L3V0aWxzL2NvbnRlbnQtc2NyaXB0cy1jb250ZXh0JztcbipcbiogdGVzdCgnc3RvcmFnZSBsaXN0ZW5lciBzaG91bGQgYmUgcmVtb3ZlZCB3aGVuIGNvbnRleHQgaXMgaW52YWxpZGF0ZWQnLCAoKSA9PiB7XG4qICAgY29uc3QgY3R4ID0gbmV3IENvbnRlbnRTY3JpcHRDb250ZXh0KCd0ZXN0Jyk7XG4qICAgY29uc3QgaXRlbSA9IHN0b3JhZ2UuZGVmaW5lSXRlbSgnbG9jYWw6Y291bnQnLCB7IGRlZmF1bHRWYWx1ZTogMCB9KTtcbiogICBjb25zdCB3YXRjaGVyID0gdmkuZm4oKTtcbipcbiogICBjb25zdCB1bndhdGNoID0gaXRlbS53YXRjaCh3YXRjaGVyKTtcbiogICBjdHgub25JbnZhbGlkYXRlZCh1bndhdGNoKTsgLy8gTGlzdGVuIGZvciBpbnZhbGlkYXRlIGhlcmVcbipcbiogICBhd2FpdCBpdGVtLnNldFZhbHVlKDEpO1xuKiAgIGV4cGVjdCh3YXRjaGVyKS50b0JlQ2FsbGVkVGltZXMoMSk7XG4qICAgZXhwZWN0KHdhdGNoZXIpLnRvQmVDYWxsZWRXaXRoKDEsIDApO1xuKlxuKiAgIGN0eC5ub3RpZnlJbnZhbGlkYXRlZCgpOyAvLyBVc2UgdGhpcyBmdW5jdGlvbiB0byBpbnZhbGlkYXRlIHRoZSBjb250ZXh0XG4qICAgYXdhaXQgaXRlbS5zZXRWYWx1ZSgyKTtcbiogICBleHBlY3Qod2F0Y2hlcikudG9CZUNhbGxlZFRpbWVzKDEpO1xuKiB9KTtcbiogYGBgXG4qL1xudmFyIENvbnRlbnRTY3JpcHRDb250ZXh0ID0gY2xhc3MgQ29udGVudFNjcmlwdENvbnRleHQge1xuXHRzdGF0aWMgU0NSSVBUX1NUQVJURURfTUVTU0FHRV9UWVBFID0gZ2V0VW5pcXVlRXZlbnROYW1lKFwid3h0OmNvbnRlbnQtc2NyaXB0LXN0YXJ0ZWRcIik7XG5cdGlkO1xuXHRhYm9ydENvbnRyb2xsZXI7XG5cdGxvY2F0aW9uV2F0Y2hlciA9IGNyZWF0ZUxvY2F0aW9uV2F0Y2hlcih0aGlzKTtcblx0Y29uc3RydWN0b3IoY29udGVudFNjcmlwdE5hbWUsIG9wdGlvbnMpIHtcblx0XHR0aGlzLmNvbnRlbnRTY3JpcHROYW1lID0gY29udGVudFNjcmlwdE5hbWU7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLmlkID0gTWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMik7XG5cdFx0dGhpcy5hYm9ydENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0dGhpcy5zdG9wT2xkU2NyaXB0cygpO1xuXHRcdHRoaXMubGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCk7XG5cdH1cblx0Z2V0IHNpZ25hbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuXHR9XG5cdGFib3J0KHJlYXNvbikge1xuXHRcdHJldHVybiB0aGlzLmFib3J0Q29udHJvbGxlci5hYm9ydChyZWFzb24pO1xuXHR9XG5cdGdldCBpc0ludmFsaWQoKSB7XG5cdFx0aWYgKGJyb3dzZXIucnVudGltZT8uaWQgPT0gbnVsbCkgdGhpcy5ub3RpZnlJbnZhbGlkYXRlZCgpO1xuXHRcdHJldHVybiB0aGlzLnNpZ25hbC5hYm9ydGVkO1xuXHR9XG5cdGdldCBpc1ZhbGlkKCkge1xuXHRcdHJldHVybiAhdGhpcy5pc0ludmFsaWQ7XG5cdH1cblx0LyoqXG5cdCogQWRkIGEgbGlzdGVuZXIgdGhhdCBpcyBjYWxsZWQgd2hlbiB0aGUgY29udGVudCBzY3JpcHQncyBjb250ZXh0IGlzXG5cdCogaW52YWxpZGF0ZWQuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqICAgYnJvd3Nlci5ydW50aW1lLm9uTWVzc2FnZS5hZGRMaXN0ZW5lcihjYik7XG5cdCogICBjb25zdCByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyID0gY3R4Lm9uSW52YWxpZGF0ZWQoKCkgPT4ge1xuXHQqICAgICBicm93c2VyLnJ1bnRpbWUub25NZXNzYWdlLnJlbW92ZUxpc3RlbmVyKGNiKTtcblx0KiAgIH0pO1xuXHQqICAgLy8gLi4uXG5cdCogICByZW1vdmVJbnZhbGlkYXRlZExpc3RlbmVyKCk7XG5cdCpcblx0KiBAcmV0dXJucyBBIGZ1bmN0aW9uIHRvIHJlbW92ZSB0aGUgbGlzdGVuZXIuXG5cdCovXG5cdG9uSW52YWxpZGF0ZWQoY2IpIHtcblx0XHR0aGlzLnNpZ25hbC5hZGRFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHRcdHJldHVybiAoKSA9PiB0aGlzLnNpZ25hbC5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWJvcnRcIiwgY2IpO1xuXHR9XG5cdC8qKlxuXHQqIFJldHVybiBhIHByb21pc2UgdGhhdCBuZXZlciByZXNvbHZlcy4gVXNlZnVsIGlmIHlvdSBoYXZlIGFuIGFzeW5jIGZ1bmN0aW9uXG5cdCogdGhhdCBzaG91bGRuJ3QgcnVuIGFmdGVyIHRoZSBjb250ZXh0IGlzIGV4cGlyZWQuXG5cdCpcblx0KiBAZXhhbXBsZVxuXHQqICAgY29uc3QgZ2V0VmFsdWVGcm9tU3RvcmFnZSA9IGFzeW5jICgpID0+IHtcblx0KiAgICAgaWYgKGN0eC5pc0ludmFsaWQpIHJldHVybiBjdHguYmxvY2soKTtcblx0KlxuXHQqICAgICAvLyAuLi5cblx0KiAgIH07XG5cdCovXG5cdGJsb2NrKCkge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoKSA9PiB7fSk7XG5cdH1cblx0LyoqXG5cdCogV3JhcHBlciBhcm91bmQgYHdpbmRvdy5zZXRJbnRlcnZhbGAgdGhhdCBhdXRvbWF0aWNhbGx5IGNsZWFycyB0aGUgaW50ZXJ2YWxcblx0KiB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogSW50ZXJ2YWxzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgY2xlYXJJbnRlcnZhbGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldEludGVydmFsKGhhbmRsZXIsIHRpbWVvdXQpIHtcblx0XHRjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIGhhbmRsZXIoKTtcblx0XHR9LCB0aW1lb3V0KTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2xlYXJJbnRlcnZhbChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnNldFRpbWVvdXRgIHRoYXQgYXV0b21hdGljYWxseSBjbGVhcnMgdGhlIGludGVydmFsXG5cdCogd2hlbiBpbnZhbGlkYXRlZC5cblx0KlxuXHQqIFRpbWVvdXRzIGNhbiBiZSBjbGVhcmVkIGJ5IGNhbGxpbmcgdGhlIG5vcm1hbCBgc2V0VGltZW91dGAgZnVuY3Rpb24uXG5cdCovXG5cdHNldFRpbWVvdXQoaGFuZGxlciwgdGltZW91dCkge1xuXHRcdGNvbnN0IGlkID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5pc1ZhbGlkKSBoYW5kbGVyKCk7XG5cdFx0fSwgdGltZW91dCk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNsZWFyVGltZW91dChpZCkpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXHQvKipcblx0KiBXcmFwcGVyIGFyb3VuZCBgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZWAgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHNcblx0KiB0aGUgcmVxdWVzdCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbEFuaW1hdGlvbkZyYW1lYFxuXHQqIGZ1bmN0aW9uLlxuXHQqL1xuXHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoY2FsbGJhY2spIHtcblx0XHRjb25zdCBpZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWYWxpZCkgY2FsbGJhY2soLi4uYXJncyk7XG5cdFx0fSk7XG5cdFx0dGhpcy5vbkludmFsaWRhdGVkKCgpID0+IGNhbmNlbEFuaW1hdGlvbkZyYW1lKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdC8qKlxuXHQqIFdyYXBwZXIgYXJvdW5kIGB3aW5kb3cucmVxdWVzdElkbGVDYWxsYmFja2AgdGhhdCBhdXRvbWF0aWNhbGx5IGNhbmNlbHMgdGhlXG5cdCogcmVxdWVzdCB3aGVuIGludmFsaWRhdGVkLlxuXHQqXG5cdCogQ2FsbGJhY2tzIGNhbiBiZSBjYW5jZWxlZCBieSBjYWxsaW5nIHRoZSBub3JtYWwgYGNhbmNlbElkbGVDYWxsYmFja2Bcblx0KiBmdW5jdGlvbi5cblx0Ki9cblx0cmVxdWVzdElkbGVDYWxsYmFjayhjYWxsYmFjaywgb3B0aW9ucykge1xuXHRcdGNvbnN0IGlkID0gcmVxdWVzdElkbGVDYWxsYmFjaygoLi4uYXJncykgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNpZ25hbC5hYm9ydGVkKSBjYWxsYmFjayguLi5hcmdzKTtcblx0XHR9LCBvcHRpb25zKTtcblx0XHR0aGlzLm9uSW52YWxpZGF0ZWQoKCkgPT4gY2FuY2VsSWRsZUNhbGxiYWNrKGlkKSk7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGFkZEV2ZW50TGlzdGVuZXIodGFyZ2V0LCB0eXBlLCBoYW5kbGVyLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGUgPT09IFwid3h0OmxvY2F0aW9uY2hhbmdlXCIpIHtcblx0XHRcdGlmICh0aGlzLmlzVmFsaWQpIHRoaXMubG9jYXRpb25XYXRjaGVyLnJ1bigpO1xuXHRcdH1cblx0XHR0YXJnZXQuYWRkRXZlbnRMaXN0ZW5lcj8uKHR5cGUuc3RhcnRzV2l0aChcInd4dDpcIikgPyBnZXRVbmlxdWVFdmVudE5hbWUodHlwZSkgOiB0eXBlLCBoYW5kbGVyLCB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0c2lnbmFsOiB0aGlzLnNpZ25hbFxuXHRcdH0pO1xuXHR9XG5cdC8qKlxuXHQqIEBpbnRlcm5hbFxuXHQqIEFib3J0IHRoZSBhYm9ydCBjb250cm9sbGVyIGFuZCBleGVjdXRlIGFsbCBgb25JbnZhbGlkYXRlZGAgbGlzdGVuZXJzLlxuXHQqL1xuXHRub3RpZnlJbnZhbGlkYXRlZCgpIHtcblx0XHR0aGlzLmFib3J0KFwiQ29udGVudCBzY3JpcHQgY29udGV4dCBpbnZhbGlkYXRlZFwiKTtcblx0XHRsb2dnZXIuZGVidWcoYENvbnRlbnQgc2NyaXB0IFwiJHt0aGlzLmNvbnRlbnRTY3JpcHROYW1lfVwiIGNvbnRleHQgaW52YWxpZGF0ZWRgKTtcblx0fVxuXHRzdG9wT2xkU2NyaXB0cygpIHtcblx0XHRkb2N1bWVudC5kaXNwYXRjaEV2ZW50KG5ldyBDdXN0b21FdmVudChDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsIHsgZGV0YWlsOiB7XG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0gfSkpO1xuXHRcdHdpbmRvdy5wb3N0TWVzc2FnZSh7XG5cdFx0XHR0eXBlOiBDb250ZW50U2NyaXB0Q29udGV4dC5TQ1JJUFRfU1RBUlRFRF9NRVNTQUdFX1RZUEUsXG5cdFx0XHRjb250ZW50U2NyaXB0TmFtZTogdGhpcy5jb250ZW50U2NyaXB0TmFtZSxcblx0XHRcdG1lc3NhZ2VJZDogdGhpcy5pZFxuXHRcdH0sIFwiKlwiKTtcblx0fVxuXHR2ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpIHtcblx0XHRjb25zdCBpc1NhbWVDb250ZW50U2NyaXB0ID0gZXZlbnQuZGV0YWlsPy5jb250ZW50U2NyaXB0TmFtZSA9PT0gdGhpcy5jb250ZW50U2NyaXB0TmFtZTtcblx0XHRjb25zdCBpc0Zyb21TZWxmID0gZXZlbnQuZGV0YWlsPy5tZXNzYWdlSWQgPT09IHRoaXMuaWQ7XG5cdFx0cmV0dXJuIGlzU2FtZUNvbnRlbnRTY3JpcHQgJiYgIWlzRnJvbVNlbGY7XG5cdH1cblx0bGlzdGVuRm9yTmV3ZXJTY3JpcHRzKCkge1xuXHRcdGNvbnN0IGNiID0gKGV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIShldmVudCBpbnN0YW5jZW9mIEN1c3RvbUV2ZW50KSB8fCAhdGhpcy52ZXJpZnlTY3JpcHRTdGFydGVkRXZlbnQoZXZlbnQpKSByZXR1cm47XG5cdFx0XHR0aGlzLm5vdGlmeUludmFsaWRhdGVkKCk7XG5cdFx0fTtcblx0XHRkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpO1xuXHRcdHRoaXMub25JbnZhbGlkYXRlZCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKENvbnRlbnRTY3JpcHRDb250ZXh0LlNDUklQVF9TVEFSVEVEX01FU1NBR0VfVFlQRSwgY2IpKTtcblx0fVxufTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgQ29udGVudFNjcmlwdENvbnRleHQgfTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCw1LDYsNyw4LDksMTBdLCJtYXBwaW5ncyI6Ijs7Q0FDQSxTQUFTLG9CQUFvQixZQUFZO0FBQ3hDLFNBQU87Ozs7Q0NBUixJQUFhLGlCQUFi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