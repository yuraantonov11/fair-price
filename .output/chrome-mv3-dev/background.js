var background = (function() {
	//#region node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region src/core/models/HonestyCalculator.ts
	var HonestyCalculator = class {
		static _calculateMedian(prices) {
			if (prices.length === 0) return 0;
			const sorted = [...prices].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
		}
		static _detectSpike(priceHistory, discountStartDate) {
			const preDiscountPeriod = priceHistory.filter((p) => p.date < discountStartDate && p.date > discountStartDate - 336 * 60 * 60 * 1e3);
			if (preDiscountPeriod.length < 2) return false;
			const prices = preDiscountPeriod.map((p) => p.price);
			const maxPrice = Math.max(...prices);
			const minPrice = Math.min(...prices);
			return (maxPrice - minPrice) / minPrice > .2;
		}
		static calculate(currentPrice, priceHistory) {
			if (priceHistory.length < 5) return {
				score: -1,
				message: "Недостатньо даних для аналізу."
			};
			const last30Days = priceHistory.filter((p) => p.date > Date.now() - 720 * 60 * 60 * 1e3);
			const last60Days = priceHistory;
			const p_min30 = Math.min(...last30Days.map((p) => p.price));
			const p_median60 = this._calculateMedian(last60Days.map((p) => p.price));
			let penaltySpike = 0;
			if (this._detectSpike(last60Days, Date.now())) penaltySpike = 50;
			const rawScore = (1 - (currentPrice - p_min30) / p_median60) * 100 - penaltySpike;
			const score = Math.max(0, rawScore);
			let message = "Аналіз чесності знижки.";
			if (score < 50) message = "Знижка виглядає підозріло. Ціна нещодавно була нижчою.";
			else if (score > 80) message = "Це хороша знижка порівняно з попередньою історією цін.";
			return {
				score: Math.round(score),
				message
			};
		}
	};
	//#endregion
	//#region src/entrypoints/background.ts
	var background_default = defineBackground(() => {
		console.log("Fair Price Service Worker Loaded");
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
			if (request.action === "checkPrice") {
				handleCheckPrice(request.payload, sendResponse);
				return true;
			}
		});
		async function handleCheckPrice(payload, sendResponse) {
			const { sku, currentPrice } = payload;
			try {
				console.log(`Checking price for SKU: ${sku}, Price: ${currentPrice}`);
				const cachedData = await getLocalPriceHistory(sku);
				if (cachedData && isFresh(cachedData.timestamp)) {
					sendResponse({
						success: true,
						score: HonestyCalculator.calculate(currentPrice, cachedData.history),
						history: cachedData.history
					});
					return;
				}
				const mockHistory = generateMockHistory(currentPrice);
				const score = HonestyCalculator.calculate(currentPrice, mockHistory);
				await saveLocalPriceHistory(sku, mockHistory);
				sendResponse({
					success: true,
					score,
					history: mockHistory
				});
			} catch (error) {
				console.error("Error checking price:", error);
				sendResponse({
					success: false,
					error: error.message || String(error)
				});
			}
		}
		async function getLocalPriceHistory(sku) {
			return new Promise((resolve) => {
				chrome.storage.local.get([sku], (result) => {
					resolve(result[sku] || null);
				});
			});
		}
		async function saveLocalPriceHistory(sku, history) {
			return new Promise((resolve) => {
				chrome.storage.local.set({ [sku]: {
					history,
					timestamp: Date.now()
				} }, () => resolve());
			});
		}
		function isFresh(timestamp) {
			return Date.now() - timestamp < 3600 * 1e3;
		}
		function generateMockHistory(basePrice) {
			const history = [];
			const now = Date.now();
			for (let i = 0; i < 60; i++) {
				const date = now - i * 24 * 60 * 60 * 1e3;
				const price = basePrice * (1 + (Math.random() * .2 - .1));
				history.push({
					date,
					price
				});
			}
			return history;
		}
	});
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
	//#region node_modules/@webext-core/match-patterns/lib/index.js
	var _MatchPattern = class {
		constructor(matchPattern) {
			if (matchPattern === "<all_urls>") {
				this.isAllUrls = true;
				this.protocolMatches = [..._MatchPattern.PROTOCOLS];
				this.hostnameMatch = "*";
				this.pathnameMatch = "*";
			} else {
				const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
				if (groups == null) throw new InvalidMatchPattern(matchPattern, "Incorrect format");
				const [_, protocol, hostname, pathname] = groups;
				validateProtocol(matchPattern, protocol);
				validateHostname(matchPattern, hostname);
				validatePathname(matchPattern, pathname);
				this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
				this.hostnameMatch = hostname;
				this.pathnameMatch = pathname;
			}
		}
		includes(url) {
			if (this.isAllUrls) return true;
			const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
			return !!this.protocolMatches.find((protocol) => {
				if (protocol === "http") return this.isHttpMatch(u);
				if (protocol === "https") return this.isHttpsMatch(u);
				if (protocol === "file") return this.isFileMatch(u);
				if (protocol === "ftp") return this.isFtpMatch(u);
				if (protocol === "urn") return this.isUrnMatch(u);
			});
		}
		isHttpMatch(url) {
			return url.protocol === "http:" && this.isHostPathMatch(url);
		}
		isHttpsMatch(url) {
			return url.protocol === "https:" && this.isHostPathMatch(url);
		}
		isHostPathMatch(url) {
			if (!this.hostnameMatch || !this.pathnameMatch) return false;
			const hostnameMatchRegexs = [this.convertPatternToRegex(this.hostnameMatch), this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))];
			const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
			return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
		}
		isFileMatch(url) {
			throw Error("Not implemented: file:// pattern matching. Open a PR to add support");
		}
		isFtpMatch(url) {
			throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
		}
		isUrnMatch(url) {
			throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
		}
		convertPatternToRegex(pattern) {
			const starsReplaced = this.escapeForRegex(pattern).replace(/\\\*/g, ".*");
			return RegExp(`^${starsReplaced}$`);
		}
		escapeForRegex(string) {
			return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	};
	var MatchPattern = _MatchPattern;
	MatchPattern.PROTOCOLS = [
		"http",
		"https",
		"file",
		"ftp",
		"urn"
	];
	var InvalidMatchPattern = class extends Error {
		constructor(matchPattern, reason) {
			super(`Invalid match pattern "${matchPattern}": ${reason}`);
		}
	};
	function validateProtocol(matchPattern, protocol) {
		if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*") throw new InvalidMatchPattern(matchPattern, `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`);
	}
	function validateHostname(matchPattern, hostname) {
		if (hostname.includes(":")) throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
		if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*.")) throw new InvalidMatchPattern(matchPattern, `If using a wildcard (*), it must go at the start of the hostname`);
	}
	function validatePathname(matchPattern, pathname) {}
	//#endregion
	//#region \0virtual:wxt-background-entrypoint?C:/Users/yuraa/WebstormProjects/fair_price/src/entrypoints/background.ts
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
	var ws;
	/** Connect to the websocket and listen for messages. */
	function getDevServerWebSocket() {
		if (ws == null) {
			const serverUrl = "ws://localhost:3000";
			logger.debug("Connecting to dev server @", serverUrl);
			ws = new WebSocket(serverUrl, "vite-hmr");
			ws.addWxtEventListener = ws.addEventListener.bind(ws);
			ws.sendCustom = (event, payload) => ws?.send(JSON.stringify({
				type: "custom",
				event,
				payload
			}));
			ws.addEventListener("open", () => {
				logger.debug("Connected to dev server");
			});
			ws.addEventListener("close", () => {
				logger.debug("Disconnected from dev server");
			});
			ws.addEventListener("error", (event) => {
				logger.error("Failed to connect to dev server", event);
			});
			ws.addEventListener("message", (e) => {
				try {
					const message = JSON.parse(e.data);
					if (message.type === "custom") ws?.dispatchEvent(new CustomEvent(message.event, { detail: message.data }));
				} catch (err) {
					logger.error("Failed to handle message", err);
				}
			});
		}
		return ws;
	}
	/** https://developer.chrome.com/blog/longer-esw-lifetimes/ */
	function keepServiceWorkerAlive() {
		setInterval(async () => {
			await browser.runtime.getPlatformInfo();
		}, 5e3);
	}
	function reloadContentScript(payload) {
		if (browser.runtime.getManifest().manifest_version == 2) reloadContentScriptMv2(payload);
		else reloadContentScriptMv3(payload);
	}
	async function reloadContentScriptMv3({ registration, contentScript }) {
		if (registration === "runtime") await reloadRuntimeContentScriptMv3(contentScript);
		else await reloadManifestContentScriptMv3(contentScript);
	}
	async function reloadManifestContentScriptMv3(contentScript) {
		const id = `wxt:${contentScript.js[0]}`;
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const existing = registered.find((cs) => cs.id === id);
		if (existing) {
			logger.debug("Updating content script", existing);
			await browser.scripting.updateContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		} else {
			logger.debug("Registering new content script...");
			await browser.scripting.registerContentScripts([{
				...contentScript,
				id,
				css: contentScript.css ?? []
			}]);
		}
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadRuntimeContentScriptMv3(contentScript) {
		logger.log("Reloading content script:", contentScript);
		const registered = await browser.scripting.getRegisteredContentScripts();
		logger.debug("Existing scripts:", registered);
		const matches = registered.filter((cs) => {
			const hasJs = contentScript.js?.find((js) => cs.js?.includes(js));
			const hasCss = contentScript.css?.find((css) => cs.css?.includes(css));
			return hasJs || hasCss;
		});
		if (matches.length === 0) {
			logger.log("Content script is not registered yet, nothing to reload", contentScript);
			return;
		}
		await browser.scripting.updateContentScripts(matches);
		await reloadTabsForContentScript(contentScript);
	}
	async function reloadTabsForContentScript(contentScript) {
		const allTabs = await browser.tabs.query({});
		const matchPatterns = contentScript.matches.map((match) => new MatchPattern(match));
		const matchingTabs = allTabs.filter((tab) => {
			const url = tab.url;
			if (!url) return false;
			return !!matchPatterns.find((pattern) => pattern.includes(url));
		});
		await Promise.all(matchingTabs.map(async (tab) => {
			try {
				await browser.tabs.reload(tab.id);
			} catch (err) {
				logger.warn("Failed to reload tab:", err);
			}
		}));
	}
	async function reloadContentScriptMv2(_payload) {
		throw Error("TODO: reloadContentScriptMv2");
	}
	try {
		const ws = getDevServerWebSocket();
		ws.addWxtEventListener("wxt:reload-extension", () => {
			browser.runtime.reload();
		});
		ws.addWxtEventListener("wxt:reload-content-script", (event) => {
			reloadContentScript(event.detail);
		});
		ws.addEventListener("open", () => ws.sendCustom("wxt:background-initialized"));
		keepServiceWorkerAlive();
	} catch (err) {
		logger.error("Failed to setup web socket connection with dev server", err);
	}
	browser.commands.onCommand.addListener((command) => {
		if (command === "wxt:reload-extension") browser.runtime.reload();
	});
	var result;
	try {
		result = background_default.main();
		if (result instanceof Promise) console.warn("The background's main() function return a promise, but it must be synchronous");
	} catch (err) {
		logger.error("The background crashed on startup!");
		throw err;
	}
	//#endregion
	return result;
})();

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImJyb3dzZXIiXSwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQubWpzIiwiLi4vLi4vc3JjL2NvcmUvbW9kZWxzL0hvbmVzdHlDYWxjdWxhdG9yLnRzIiwiLi4vLi4vc3JjL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8jcmVnaW9uIHNyYy91dGlscy9kZWZpbmUtYmFja2dyb3VuZC50c1xuZnVuY3Rpb24gZGVmaW5lQmFja2dyb3VuZChhcmcpIHtcblx0aWYgKGFyZyA9PSBudWxsIHx8IHR5cGVvZiBhcmcgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHsgbWFpbjogYXJnIH07XG5cdHJldHVybiBhcmc7XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUJhY2tncm91bmQgfTtcbiIsImludGVyZmFjZSBQcmljZUhpc3Rvcnkge1xyXG4gIGRhdGU6IG51bWJlcjtcclxuICBwcmljZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgU2NvcmVSZXN1bHQge1xyXG4gIHNjb3JlOiBudW1iZXI7XHJcbiAgbWVzc2FnZTogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSG9uZXN0eUNhbGN1bGF0b3Ige1xyXG4gIHN0YXRpYyBfY2FsY3VsYXRlTWVkaWFuKHByaWNlczogbnVtYmVyW10pOiBudW1iZXIge1xyXG4gICAgaWYgKHByaWNlcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xyXG4gICAgY29uc3Qgc29ydGVkID0gWy4uLnByaWNlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xyXG4gICAgY29uc3QgbWlkID0gTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMik7XHJcbiAgICByZXR1cm4gc29ydGVkLmxlbmd0aCAlIDIgIT09IDAgPyBzb3J0ZWRbbWlkXSA6IChzb3J0ZWRbbWlkIC0gMV0gKyBzb3J0ZWRbbWlkXSkgLyAyO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIF9kZXRlY3RTcGlrZShwcmljZUhpc3Rvcnk6IFByaWNlSGlzdG9yeVtdLCBkaXNjb3VudFN0YXJ0RGF0ZTogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBwcmVEaXNjb3VudFBlcmlvZCA9IHByaWNlSGlzdG9yeS5maWx0ZXIocCA9PiBcclxuICAgICAgcC5kYXRlIDwgZGlzY291bnRTdGFydERhdGUgJiYgXHJcbiAgICAgIHAuZGF0ZSA+IGRpc2NvdW50U3RhcnREYXRlIC0gMTQgKiAyNCAqIDYwICogNjAgKiAxMDAwXHJcbiAgICApO1xyXG4gICAgaWYgKHByZURpc2NvdW50UGVyaW9kLmxlbmd0aCA8IDIpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICBjb25zdCBwcmljZXMgPSBwcmVEaXNjb3VudFBlcmlvZC5tYXAocCA9PiBwLnByaWNlKTtcclxuICAgIGNvbnN0IG1heFByaWNlID0gTWF0aC5tYXgoLi4ucHJpY2VzKTtcclxuICAgIGNvbnN0IG1pblByaWNlID0gTWF0aC5taW4oLi4ucHJpY2VzKTtcclxuXHJcbiAgICByZXR1cm4gKG1heFByaWNlIC0gbWluUHJpY2UpIC8gbWluUHJpY2UgPiAwLjIwO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGNhbGN1bGF0ZShjdXJyZW50UHJpY2U6IG51bWJlciwgcHJpY2VIaXN0b3J5OiBQcmljZUhpc3RvcnlbXSk6IFNjb3JlUmVzdWx0IHtcclxuICAgIGlmIChwcmljZUhpc3RvcnkubGVuZ3RoIDwgNSkge1xyXG4gICAgICByZXR1cm4geyBzY29yZTogLTEsIG1lc3NhZ2U6IFwi0J3QtdC00L7RgdGC0LDRgtC90YzQviDQtNCw0L3QuNGFINC00LvRjyDQsNC90LDQu9GW0LfRgy5cIiB9O1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGxhc3QzMERheXMgPSBwcmljZUhpc3RvcnkuZmlsdGVyKHAgPT4gcC5kYXRlID4gRGF0ZS5ub3coKSAtIDMwICogMjQgKiA2MCAqIDYwICogMTAwMCk7XHJcbiAgICBjb25zdCBsYXN0NjBEYXlzID0gcHJpY2VIaXN0b3J5O1xyXG5cclxuICAgIGNvbnN0IHBfbWluMzAgPSBNYXRoLm1pbiguLi5sYXN0MzBEYXlzLm1hcChwID0+IHAucHJpY2UpKTtcclxuICAgIGNvbnN0IHBfbWVkaWFuNjAgPSB0aGlzLl9jYWxjdWxhdGVNZWRpYW4obGFzdDYwRGF5cy5tYXAocCA9PiBwLnByaWNlKSk7XHJcblxyXG4gICAgbGV0IHBlbmFsdHlTcGlrZSA9IDA7XHJcbiAgICBpZiAodGhpcy5fZGV0ZWN0U3Bpa2UobGFzdDYwRGF5cywgRGF0ZS5ub3coKSkpIHtcclxuICAgICAgcGVuYWx0eVNwaWtlID0gNTA7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcmF3U2NvcmUgPSAoMSAtIChjdXJyZW50UHJpY2UgLSBwX21pbjMwKSAvIHBfbWVkaWFuNjApICogMTAwIC0gcGVuYWx0eVNwaWtlO1xyXG4gICAgY29uc3Qgc2NvcmUgPSBNYXRoLm1heCgwLCByYXdTY29yZSk7XHJcblxyXG4gICAgbGV0IG1lc3NhZ2UgPSBcItCQ0L3QsNC70ZbQtyDRh9C10YHQvdC+0YHRgtGWINC30L3QuNC20LrQuC5cIjtcclxuICAgIGlmIChzY29yZSA8IDUwKSB7XHJcbiAgICAgIG1lc3NhZ2UgPSBcItCX0L3QuNC20LrQsCDQstC40LPQu9GP0LTQsNGUINC/0ZbQtNC+0LfRgNGW0LvQvi4g0KbRltC90LAg0L3QtdGJ0L7QtNCw0LLQvdC+INCx0YPQu9CwINC90LjQttGH0L7Rji5cIjtcclxuICAgIH0gZWxzZSBpZiAoc2NvcmUgPiA4MCkge1xyXG4gICAgICBtZXNzYWdlID0gXCLQptC1INGF0L7RgNC+0YjQsCDQt9C90LjQttC60LAg0L/QvtGA0ZbQstC90Y/QvdC+INC3INC/0L7Qv9C10YDQtdC00L3RjNC+0Y4g0ZbRgdGC0L7RgNGW0ZTRjiDRhtGW0L0uXCI7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHsgc2NvcmU6IE1hdGgucm91bmQoc2NvcmUpLCBtZXNzYWdlIH07XHJcbiAgfVxyXG59XHJcbiIsIi8vIEB0cy1ub2NoZWNrXHJcbmltcG9ydCB7IEhvbmVzdHlDYWxjdWxhdG9yIH0gZnJvbSAnQC9jb3JlL21vZGVscy9Ib25lc3R5Q2FsY3VsYXRvcic7XHJcblxyXG5pbnRlcmZhY2UgUHJpY2VDaGVja1BheWxvYWQge1xyXG4gIHVybDogc3RyaW5nO1xyXG4gIHNrdTogc3RyaW5nO1xyXG4gIGN1cnJlbnRQcmljZTogbnVtYmVyO1xyXG4gIHRpdGxlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBQcmljZUhpc3RvcnlFbnRyeSB7XHJcbiAgZGF0ZTogbnVtYmVyO1xyXG4gIHByaWNlOiBudW1iZXI7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDYWNoZWREYXRhIHtcclxuICBoaXN0b3J5OiBQcmljZUhpc3RvcnlFbnRyeVtdO1xyXG4gIHRpbWVzdGFtcDogbnVtYmVyO1xyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVCYWNrZ3JvdW5kKCgpID0+IHtcclxuICBjb25zb2xlLmxvZyhcIkZhaXIgUHJpY2UgU2VydmljZSBXb3JrZXIgTG9hZGVkXCIpO1xyXG5cclxuICBjaHJvbWUucnVudGltZS5vbk1lc3NhZ2UuYWRkTGlzdGVuZXIoKHJlcXVlc3QsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSA9PiB7XHJcbiAgICBpZiAocmVxdWVzdC5hY3Rpb24gPT09IFwiY2hlY2tQcmljZVwiKSB7XHJcbiAgICAgIGhhbmRsZUNoZWNrUHJpY2UocmVxdWVzdC5wYXlsb2FkIGFzIFByaWNlQ2hlY2tQYXlsb2FkLCBzZW5kUmVzcG9uc2UpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgbWVzc2FnZSBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlXHJcbiAgICB9XHJcbiAgfSk7XHJcblxyXG4gIGFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNoZWNrUHJpY2UocGF5bG9hZDogUHJpY2VDaGVja1BheWxvYWQsIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlPzogYW55KSA9PiB2b2lkKSB7XHJcbiAgICBjb25zdCB7IHNrdSwgY3VycmVudFByaWNlIH0gPSBwYXlsb2FkO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zb2xlLmxvZyhgQ2hlY2tpbmcgcHJpY2UgZm9yIFNLVTogJHtza3V9LCBQcmljZTogJHtjdXJyZW50UHJpY2V9YCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBjYWNoZWREYXRhID0gYXdhaXQgZ2V0TG9jYWxQcmljZUhpc3Rvcnkoc2t1KTtcclxuICAgICAgXHJcbiAgICAgIGlmIChjYWNoZWREYXRhICYmIGlzRnJlc2goY2FjaGVkRGF0YS50aW1lc3RhbXApKSB7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSBIb25lc3R5Q2FsY3VsYXRvci5jYWxjdWxhdGUoY3VycmVudFByaWNlLCBjYWNoZWREYXRhLmhpc3RvcnkpO1xyXG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUsIHNjb3JlLCBoaXN0b3J5OiBjYWNoZWREYXRhLmhpc3RvcnkgfSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyDQhtC80ZbRgtGD0ZTQvNC+INCx0LXQutC10L3QtFxyXG4gICAgICBjb25zdCBtb2NrSGlzdG9yeSA9IGdlbmVyYXRlTW9ja0hpc3RvcnkoY3VycmVudFByaWNlKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHNjb3JlID0gSG9uZXN0eUNhbGN1bGF0b3IuY2FsY3VsYXRlKGN1cnJlbnRQcmljZSwgbW9ja0hpc3RvcnkpO1xyXG5cclxuICAgICAgYXdhaXQgc2F2ZUxvY2FsUHJpY2VIaXN0b3J5KHNrdSwgbW9ja0hpc3RvcnkpO1xyXG5cclxuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSwgc2NvcmUsIGhpc3Rvcnk6IG1vY2tIaXN0b3J5IH0pO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgY29uc29sZS5lcnJvcihcIkVycm9yIGNoZWNraW5nIHByaWNlOlwiLCBlcnJvcik7XHJcbiAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB8fCBTdHJpbmcoZXJyb3IpIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZnVuY3Rpb24gZ2V0TG9jYWxQcmljZUhpc3Rvcnkoc2t1OiBzdHJpbmcpOiBQcm9taXNlPENhY2hlZERhdGEgfCBudWxsPiB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcclxuICAgICAgY2hyb21lLnN0b3JhZ2UubG9jYWwuZ2V0KFtza3VdLCAocmVzdWx0KSA9PiB7XHJcbiAgICAgICAgcmVzb2x2ZSgocmVzdWx0W3NrdV0gYXMgQ2FjaGVkRGF0YSkgfHwgbnVsbCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiBzYXZlTG9jYWxQcmljZUhpc3Rvcnkoc2t1OiBzdHJpbmcsIGhpc3Rvcnk6IFByaWNlSGlzdG9yeUVudHJ5W10pIHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xyXG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5zZXQoe1xyXG4gICAgICAgIFtza3VdOiB7XHJcbiAgICAgICAgICBoaXN0b3J5LFxyXG4gICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpXHJcbiAgICAgICAgfVxyXG4gICAgICB9LCAoKSA9PiByZXNvbHZlKCkpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBpc0ZyZXNoKHRpbWVzdGFtcDogbnVtYmVyKSB7XHJcbiAgICAvLyBDYWNoZSBmb3IgMSBob3VyXHJcbiAgICByZXR1cm4gRGF0ZS5ub3coKSAtIHRpbWVzdGFtcCA8IDYwICogNjAgKiAxMDAwO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ2VuZXJhdGVNb2NrSGlzdG9yeShiYXNlUHJpY2U6IG51bWJlcik6IFByaWNlSGlzdG9yeUVudHJ5W10ge1xyXG4gICAgY29uc3QgaGlzdG9yeTogUHJpY2VIaXN0b3J5RW50cnlbXSA9IFtdO1xyXG4gICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNjA7IGkrKykge1xyXG4gICAgICBjb25zdCBkYXRlID0gbm93IC0gaSAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XHJcbiAgICAgIC8vIFNpbXVsYXRlIHNvbWUgZmx1Y3R1YXRpb25cclxuICAgICAgY29uc3QgcHJpY2UgPSBiYXNlUHJpY2UgKiAoMSArIChNYXRoLnJhbmRvbSgpICogMC4yIC0gMC4xKSk7XHJcbiAgICAgIGhpc3RvcnkucHVzaCh7IGRhdGUsIHByaWNlIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGhpc3Rvcnk7XHJcbiAgfVxyXG59KTsiLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvblxuKiBBUElzIGluIHlvdXIgcHJvamVjdDpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSk7XG4qIGBgYFxuKlxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9O1xuIiwiLy8gc3JjL2luZGV4LnRzXG52YXIgX01hdGNoUGF0dGVybiA9IGNsYXNzIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuKSB7XG4gICAgaWYgKG1hdGNoUGF0dGVybiA9PT0gXCI8YWxsX3VybHM+XCIpIHtcbiAgICAgIHRoaXMuaXNBbGxVcmxzID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gWy4uLl9NYXRjaFBhdHRlcm4uUFJPVE9DT0xTXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gXCIqXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGdyb3VwcyA9IC8oLiopOlxcL1xcLyguKj8pKFxcLy4qKS8uZXhlYyhtYXRjaFBhdHRlcm4pO1xuICAgICAgaWYgKGdyb3VwcyA9PSBudWxsKVxuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIFwiSW5jb3JyZWN0IGZvcm1hdFwiKTtcbiAgICAgIGNvbnN0IFtfLCBwcm90b2NvbCwgaG9zdG5hbWUsIHBhdGhuYW1lXSA9IGdyb3VwcztcbiAgICAgIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCk7XG4gICAgICB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpO1xuICAgICAgdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG4gICAgfVxuICB9XG4gIGluY2x1ZGVzKHVybCkge1xuICAgIGlmICh0aGlzLmlzQWxsVXJscylcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcbiAgICByZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZpbGVcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG4gICAgfSk7XG4gIH1cbiAgaXNIdHRwTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIdHRwc01hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG4gICAgaWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaClcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBob3N0bmFtZU1hdGNoUmVnZXhzID0gW1xuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSxcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIikpXG4gICAgXTtcbiAgICBjb25zdCBwYXRobmFtZU1hdGNoUmVnZXggPSB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLnBhdGhuYW1lTWF0Y2gpO1xuICAgIHJldHVybiAhIWhvc3RuYW1lTWF0Y2hSZWdleHMuZmluZCgocmVnZXgpID0+IHJlZ2V4LnRlc3QodXJsLmhvc3RuYW1lKSkgJiYgcGF0aG5hbWVNYXRjaFJlZ2V4LnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgfVxuICBpc0ZpbGVNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZmlsZTovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNGdHBNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc1Vybk1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiB1cm46Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGNvbnZlcnRQYXR0ZXJuVG9SZWdleChwYXR0ZXJuKSB7XG4gICAgY29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlRm9yUmVnZXgocGF0dGVybik7XG4gICAgY29uc3Qgc3RhcnNSZXBsYWNlZCA9IGVzY2FwZWQucmVwbGFjZSgvXFxcXFxcKi9nLCBcIi4qXCIpO1xuICAgIHJldHVybiBSZWdFeHAoYF4ke3N0YXJzUmVwbGFjZWR9JGApO1xuICB9XG4gIGVzY2FwZUZvclJlZ2V4KHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xuICB9XG59O1xudmFyIE1hdGNoUGF0dGVybiA9IF9NYXRjaFBhdHRlcm47XG5NYXRjaFBhdHRlcm4uUFJPVE9DT0xTID0gW1wiaHR0cFwiLCBcImh0dHBzXCIsIFwiZmlsZVwiLCBcImZ0cFwiLCBcInVyblwiXTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG4gICAgc3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcbiAgfVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuICBpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIilcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGAke3Byb3RvY29sfSBub3QgYSB2YWxpZCBwcm90b2NvbCAoJHtNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmpvaW4oXCIsIFwiKX0pYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpIHtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiOlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIGBIb3N0bmFtZSBjYW5ub3QgaW5jbHVkZSBhIHBvcnRgKTtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiKlwiKSAmJiBob3N0bmFtZS5sZW5ndGggPiAxICYmICFob3N0bmFtZS5zdGFydHNXaXRoKFwiKi5cIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKSB7XG4gIHJldHVybjtcbn1cbmV4cG9ydCB7XG4gIEludmFsaWRNYXRjaFBhdHRlcm4sXG4gIE1hdGNoUGF0dGVyblxufTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwzLDQsNV0sIm1hcHBpbmdzIjoiOztDQUNBLFNBQVMsaUJBQWlCLEtBQUs7QUFDOUIsTUFBSSxPQUFPLFFBQVEsT0FBTyxRQUFRLFdBQVksUUFBTyxFQUFFLE1BQU0sS0FBSztBQUNsRSxTQUFPOzs7O0NDT1IsSUFBYSxvQkFBYixNQUErQjtFQUM3QixPQUFPLGlCQUFpQixRQUEwQjtBQUNoRCxPQUFJLE9BQU8sV0FBVyxFQUFHLFFBQU87R0FDaEMsTUFBTSxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLE1BQU0sSUFBSSxFQUFFO0dBQ2hELE1BQU0sTUFBTSxLQUFLLE1BQU0sT0FBTyxTQUFTLEVBQUU7QUFDekMsVUFBTyxPQUFPLFNBQVMsTUFBTSxJQUFJLE9BQU8sUUFBUSxPQUFPLE1BQU0sS0FBSyxPQUFPLFFBQVE7O0VBR25GLE9BQU8sYUFBYSxjQUE4Qixt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