var background = (function() {
	//#region node_modules/wxt/dist/utils/define-background.mjs
	function defineBackground(arg) {
		if (arg == null || typeof arg === "function") return { main: arg };
		return arg;
	}
	//#endregion
	//#region src/utils/HonestyCalculator.ts
	var HonestyCalculator = class {
		static calculateMedian(prices) {
			if (prices.length === 0) return 0;
			const sorted = [...prices].sort((a, b) => a - b);
			const mid = Math.floor(sorted.length / 2);
			return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
		}
		static calculate(currentPrice, priceHistory) {
			if (priceHistory.length < 5) return {
				score: -1,
				message: "Недостатньо даних для аналізу."
			};
			const prices = priceHistory.map((p) => p.price);
			const minPrice = Math.min(...prices);
			const medianPrice = this.calculateMedian(prices);
			const score = Math.max(0, (1 - (currentPrice - minPrice) / medianPrice) * 100);
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
				handleCheckPrice(request.payload, sendResponse).catch(console.error);
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsIm5hbWVzIjpbImJyb3dzZXIiXSwic291cmNlcyI6WyIuLi8uLi9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvdXRpbHMvZGVmaW5lLWJhY2tncm91bmQubWpzIiwiLi4vLi4vc3JjL3V0aWxzL0hvbmVzdHlDYWxjdWxhdG9yLnRzIiwiLi4vLi4vc3JjL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvQHd4dC1kZXYvYnJvd3Nlci9zcmMvaW5kZXgubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL3d4dC9kaXN0L2Jyb3dzZXIubWpzIiwiLi4vLi4vbm9kZV9tb2R1bGVzL0B3ZWJleHQtY29yZS9tYXRjaC1wYXR0ZXJucy9saWIvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8jcmVnaW9uIHNyYy91dGlscy9kZWZpbmUtYmFja2dyb3VuZC50c1xuZnVuY3Rpb24gZGVmaW5lQmFja2dyb3VuZChhcmcpIHtcblx0aWYgKGFyZyA9PSBudWxsIHx8IHR5cGVvZiBhcmcgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHsgbWFpbjogYXJnIH07XG5cdHJldHVybiBhcmc7XG59XG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IGRlZmluZUJhY2tncm91bmQgfTtcbiIsImV4cG9ydCBjbGFzcyBIb25lc3R5Q2FsY3VsYXRvciB7XHJcbiAgICBzdGF0aWMgY2FsY3VsYXRlTWVkaWFuKHByaWNlczogbnVtYmVyW10pOiBudW1iZXIge1xyXG4gICAgICAgIGlmIChwcmljZXMubGVuZ3RoID09PSAwKSByZXR1cm4gMDtcclxuICAgICAgICBjb25zdCBzb3J0ZWQgPSBbLi4ucHJpY2VzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XHJcbiAgICAgICAgY29uc3QgbWlkID0gTWF0aC5mbG9vcihzb3J0ZWQubGVuZ3RoIC8gMik7XHJcbiAgICAgICAgcmV0dXJuIHNvcnRlZC5sZW5ndGggJSAyICE9PSAwID8gc29ydGVkW21pZF0gOiAoc29ydGVkW21pZCAtIDFdICsgc29ydGVkW21pZF0pIC8gMjtcclxuICAgIH1cclxuXHJcbiAgICBzdGF0aWMgY2FsY3VsYXRlKGN1cnJlbnRQcmljZTogbnVtYmVyLCBwcmljZUhpc3Rvcnk6IHtwcmljZTogbnVtYmVyLCBkYXRlOiBudW1iZXJ9W10pOiB7c2NvcmU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nfSB7XHJcbiAgICAgICAgaWYgKHByaWNlSGlzdG9yeS5sZW5ndGggPCA1KSB7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHNjb3JlOiAtMSwgbWVzc2FnZTogXCLQndC10LTQvtGB0YLQsNGC0L3RjNC+INC00LDQvdC40YUg0LTQu9GPINCw0L3QsNC70ZbQt9GDLlwiIH07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHByaWNlcyA9IHByaWNlSGlzdG9yeS5tYXAocCA9PiBwLnByaWNlKTtcclxuICAgICAgICBjb25zdCBtaW5QcmljZSA9IE1hdGgubWluKC4uLnByaWNlcyk7XHJcbiAgICAgICAgY29uc3QgbWVkaWFuUHJpY2UgPSB0aGlzLmNhbGN1bGF0ZU1lZGlhbihwcmljZXMpO1xyXG5cclxuICAgICAgICAvLyDQodC/0YDQvtGJ0LXQvdCwINGE0L7RgNC80YPQu9CwINC3INCi0JdcclxuICAgICAgICBjb25zdCBzY29yZSA9IE1hdGgubWF4KDAsICgxIC0gKChjdXJyZW50UHJpY2UgLSBtaW5QcmljZSkgLyBtZWRpYW5QcmljZSkpICogMTAwKTtcclxuXHJcbiAgICAgICAgbGV0IG1lc3NhZ2UgPSBcItCQ0L3QsNC70ZbQtyDRh9C10YHQvdC+0YHRgtGWINC30L3QuNC20LrQuC5cIjtcclxuICAgICAgICBpZiAoc2NvcmUgPCA1MCkgbWVzc2FnZSA9IFwi0JfQvdC40LbQutCwINCy0LjQs9C70Y/QtNCw0ZQg0L/RltC00L7Qt9GA0ZbQu9C+LiDQptGW0L3QsCDQvdC10YnQvtC00LDQstC90L4g0LHRg9C70LAg0L3QuNC20YfQvtGOLlwiO1xyXG4gICAgICAgIGVsc2UgaWYgKHNjb3JlID4gODApIG1lc3NhZ2UgPSBcItCm0LUg0YXQvtGA0L7RiNCwINC30L3QuNC20LrQsCDQv9C+0YDRltCy0L3Rj9C90L4g0Lcg0L/QvtC/0LXRgNC10LTQvdGM0L7RjiDRltGB0YLQvtGA0ZbRlNGOINGG0ZbQvS5cIjtcclxuXHJcbiAgICAgICAgcmV0dXJuIHsgc2NvcmU6IE1hdGgucm91bmQoc2NvcmUpLCBtZXNzYWdlIH07XHJcbiAgICB9XHJcbn0iLCJpbXBvcnQgeyBIb25lc3R5Q2FsY3VsYXRvciB9IGZyb20gJ0AvdXRpbHMvSG9uZXN0eUNhbGN1bGF0b3InO1xyXG5cclxuaW50ZXJmYWNlIFByaWNlQ2hlY2tQYXlsb2FkIHtcclxuICB1cmw6IHN0cmluZztcclxuICBza3U6IHN0cmluZztcclxuICBjdXJyZW50UHJpY2U6IG51bWJlcjtcclxuICB0aXRsZTogc3RyaW5nO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUHJpY2VIaXN0b3J5RW50cnkge1xyXG4gIGRhdGU6IG51bWJlcjtcclxuICBwcmljZTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ2FjaGVkRGF0YSB7XHJcbiAgaGlzdG9yeTogUHJpY2VIaXN0b3J5RW50cnlbXTtcclxuICB0aW1lc3RhbXA6IG51bWJlcjtcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XHJcbiAgY29uc29sZS5sb2coXCJGYWlyIFByaWNlIFNlcnZpY2UgV29ya2VyIExvYWRlZFwiKTtcclxuXHJcbiAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKChyZXF1ZXN0OiBhbnksIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlciwgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWQpID0+IHtcclxuICAgIGlmIChyZXF1ZXN0LmFjdGlvbiA9PT0gXCJjaGVja1ByaWNlXCIpIHtcclxuICAgICAgaGFuZGxlQ2hlY2tQcmljZShyZXF1ZXN0LnBheWxvYWQgYXMgUHJpY2VDaGVja1BheWxvYWQsIHNlbmRSZXNwb25zZSkuY2F0Y2goY29uc29sZS5lcnJvcik7XHJcbiAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG4gIH0pO1xyXG5cclxuICBhc3luYyBmdW5jdGlvbiBoYW5kbGVDaGVja1ByaWNlKHBheWxvYWQ6IFByaWNlQ2hlY2tQYXlsb2FkLCBzZW5kUmVzcG9uc2U6IChyZXNwb25zZT86IGFueSkgPT4gdm9pZCkge1xyXG4gICAgY29uc3QgeyBza3UsIGN1cnJlbnRQcmljZSB9ID0gcGF5bG9hZDtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zb2xlLmxvZyhgQ2hlY2tpbmcgcHJpY2UgZm9yIFNLVTogJHtza3V9LCBQcmljZTogJHtjdXJyZW50UHJpY2V9YCk7XHJcblxyXG4gICAgICBjb25zdCBjYWNoZWREYXRhID0gYXdhaXQgZ2V0TG9jYWxQcmljZUhpc3Rvcnkoc2t1KTtcclxuXHJcbiAgICAgIGlmIChjYWNoZWREYXRhICYmIGlzRnJlc2goY2FjaGVkRGF0YS50aW1lc3RhbXApKSB7XHJcbiAgICAgICAgY29uc3Qgc2NvcmUgPSBIb25lc3R5Q2FsY3VsYXRvci5jYWxjdWxhdGUoY3VycmVudFByaWNlLCBjYWNoZWREYXRhLmhpc3RvcnkpO1xyXG4gICAgICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUsIHNjb3JlLCBoaXN0b3J5OiBjYWNoZWREYXRhLmhpc3RvcnkgfSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBtb2NrSGlzdG9yeSA9IGdlbmVyYXRlTW9ja0hpc3RvcnkoY3VycmVudFByaWNlKTtcclxuICAgICAgY29uc3Qgc2NvcmUgPSBIb25lc3R5Q2FsY3VsYXRvci5jYWxjdWxhdGUoY3VycmVudFByaWNlLCBtb2NrSGlzdG9yeSk7XHJcblxyXG4gICAgICBhd2FpdCBzYXZlTG9jYWxQcmljZUhpc3Rvcnkoc2t1LCBtb2NrSGlzdG9yeSk7XHJcblxyXG4gICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiB0cnVlLCBzY29yZSwgaGlzdG9yeTogbW9ja0hpc3RvcnkgfSk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgY2hlY2tpbmcgcHJpY2U6XCIsIGVycm9yKTtcclxuICAgICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBlcnJvci5tZXNzYWdlIHx8IFN0cmluZyhlcnJvcikgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiBnZXRMb2NhbFByaWNlSGlzdG9yeShza3U6IHN0cmluZyk6IFByb21pc2U8Q2FjaGVkRGF0YSB8IG51bGw+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICBjaHJvbWUuc3RvcmFnZS5sb2NhbC5nZXQoW3NrdV0sIChyZXN1bHQpID0+IHtcclxuICAgICAgICByZXNvbHZlKChyZXN1bHRbc2t1XSBhcyBDYWNoZWREYXRhKSB8fCBudWxsKTtcclxuICAgICAgfSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGZ1bmN0aW9uIHNhdmVMb2NhbFByaWNlSGlzdG9yeShza3U6IHN0cmluZywgaGlzdG9yeTogUHJpY2VIaXN0b3J5RW50cnlbXSkge1xyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICAgIGNocm9tZS5zdG9yYWdlLmxvY2FsLnNldCh7XHJcbiAgICAgICAgW3NrdV06IHtcclxuICAgICAgICAgIGhpc3RvcnksXHJcbiAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KClcclxuICAgICAgICB9XHJcbiAgICAgIH0sICgpID0+IHJlc29sdmUoKSk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGlzRnJlc2godGltZXN0YW1wOiBudW1iZXIpIHtcclxuICAgIHJldHVybiBEYXRlLm5vdygpIC0gdGltZXN0YW1wIDwgNjAgKiA2MCAqIDEwMDA7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBnZW5lcmF0ZU1vY2tIaXN0b3J5KGJhc2VQcmljZTogbnVtYmVyKTogUHJpY2VIaXN0b3J5RW50cnlbXSB7XHJcbiAgICBjb25zdCBoaXN0b3J5OiBQcmljZUhpc3RvcnlFbnRyeVtdID0gW107XHJcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IGRhdGUgPSBub3cgLSBpICogMjQgKiA2MCAqIDYwICogMTAwMDtcclxuICAgICAgY29uc3QgcHJpY2UgPSBiYXNlUHJpY2UgKiAoMSArIChNYXRoLnJhbmRvbSgpICogMC4yIC0gMC4xKSk7XHJcbiAgICAgIGhpc3RvcnkucHVzaCh7IGRhdGUsIHByaWNlIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGhpc3Rvcnk7XHJcbiAgfVxyXG59KTsiLCIvLyAjcmVnaW9uIHNuaXBwZXRcbmV4cG9ydCBjb25zdCBicm93c2VyID0gZ2xvYmFsVGhpcy5icm93c2VyPy5ydW50aW1lPy5pZFxuICA/IGdsb2JhbFRoaXMuYnJvd3NlclxuICA6IGdsb2JhbFRoaXMuY2hyb21lO1xuLy8gI2VuZHJlZ2lvbiBzbmlwcGV0XG4iLCJpbXBvcnQgeyBicm93c2VyIGFzIGJyb3dzZXIkMSB9IGZyb20gXCJAd3h0LWRldi9icm93c2VyXCI7XG4vLyNyZWdpb24gc3JjL2Jyb3dzZXIudHNcbi8qKlxuKiBDb250YWlucyB0aGUgYGJyb3dzZXJgIGV4cG9ydCB3aGljaCB5b3Ugc2hvdWxkIHVzZSB0byBhY2Nlc3MgdGhlIGV4dGVuc2lvblxuKiBBUElzIGluIHlvdXIgcHJvamVjdDpcbipcbiogYGBgdHNcbiogaW1wb3J0IHsgYnJvd3NlciB9IGZyb20gJ3d4dC9icm93c2VyJztcbipcbiogYnJvd3Nlci5ydW50aW1lLm9uSW5zdGFsbGVkLmFkZExpc3RlbmVyKCgpID0+IHtcbiogICAvLyAuLi5cbiogfSk7XG4qIGBgYFxuKlxuKiBAbW9kdWxlIHd4dC9icm93c2VyXG4qL1xuY29uc3QgYnJvd3NlciA9IGJyb3dzZXIkMTtcbi8vI2VuZHJlZ2lvblxuZXhwb3J0IHsgYnJvd3NlciB9O1xuIiwiLy8gc3JjL2luZGV4LnRzXG52YXIgX01hdGNoUGF0dGVybiA9IGNsYXNzIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuKSB7XG4gICAgaWYgKG1hdGNoUGF0dGVybiA9PT0gXCI8YWxsX3VybHM+XCIpIHtcbiAgICAgIHRoaXMuaXNBbGxVcmxzID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gWy4uLl9NYXRjaFBhdHRlcm4uUFJPVE9DT0xTXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gXCIqXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGdyb3VwcyA9IC8oLiopOlxcL1xcLyguKj8pKFxcLy4qKS8uZXhlYyhtYXRjaFBhdHRlcm4pO1xuICAgICAgaWYgKGdyb3VwcyA9PSBudWxsKVxuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIFwiSW5jb3JyZWN0IGZvcm1hdFwiKTtcbiAgICAgIGNvbnN0IFtfLCBwcm90b2NvbCwgaG9zdG5hbWUsIHBhdGhuYW1lXSA9IGdyb3VwcztcbiAgICAgIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCk7XG4gICAgICB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpO1xuICAgICAgdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG4gICAgfVxuICB9XG4gIGluY2x1ZGVzKHVybCkge1xuICAgIGlmICh0aGlzLmlzQWxsVXJscylcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcbiAgICByZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZpbGVcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG4gICAgfSk7XG4gIH1cbiAgaXNIdHRwTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIdHRwc01hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG4gICAgaWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaClcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBob3N0bmFtZU1hdGNoUmVnZXhzID0gW1xuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSxcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIikpXG4gICAgXTtcbiAgICBjb25zdCBwYXRobmFtZU1hdGNoUmVnZXggPSB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLnBhdGhuYW1lTWF0Y2gpO1xuICAgIHJldHVybiAhIWhvc3RuYW1lTWF0Y2hSZWdleHMuZmluZCgocmVnZXgpID0+IHJlZ2V4LnRlc3QodXJsLmhvc3RuYW1lKSkgJiYgcGF0aG5hbWVNYXRjaFJlZ2V4LnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgfVxuICBpc0ZpbGVNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZmlsZTovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNGdHBNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc1Vybk1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiB1cm46Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGNvbnZlcnRQYXR0ZXJuVG9SZWdleChwYXR0ZXJuKSB7XG4gICAgY29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlRm9yUmVnZXgocGF0dGVybik7XG4gICAgY29uc3Qgc3RhcnNSZXBsYWNlZCA9IGVzY2FwZWQucmVwbGFjZSgvXFxcXFxcKi9nLCBcIi4qXCIpO1xuICAgIHJldHVybiBSZWdFeHAoYF4ke3N0YXJzUmVwbGFjZWR9JGApO1xuICB9XG4gIGVzY2FwZUZvclJlZ2V4KHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xuICB9XG59O1xudmFyIE1hdGNoUGF0dGVybiA9IF9NYXRjaFBhdHRlcm47XG5NYXRjaFBhdHRlcm4uUFJPVE9DT0xTID0gW1wiaHR0cFwiLCBcImh0dHBzXCIsIFwiZmlsZVwiLCBcImZ0cFwiLCBcInVyblwiXTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG4gICAgc3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcbiAgfVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuICBpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIilcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGAke3Byb3RvY29sfSBub3QgYSB2YWxpZCBwcm90b2NvbCAoJHtNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmpvaW4oXCIsIFwiKX0pYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpIHtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiOlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIGBIb3N0bmFtZSBjYW5ub3QgaW5jbHVkZSBhIHBvcnRgKTtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiKlwiKSAmJiBob3N0bmFtZS5sZW5ndGggPiAxICYmICFob3N0bmFtZS5zdGFydHNXaXRoKFwiKi5cIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKSB7XG4gIHJldHVybjtcbn1cbmV4cG9ydCB7XG4gIEludmFsaWRNYXRjaFBhdHRlcm4sXG4gIE1hdGNoUGF0dGVyblxufTtcbiJdLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMCwzLDQsNV0sIm1hcHBpbmdzIjoiOztDQUNBLFNBQVMsaUJBQWlCLEtBQUs7QUFDOUIsTUFBSSxPQUFPLFFBQVEsT0FBTyxRQUFRLFdBQVksUUFBTyxFQUFFLE1BQU0sS0FBSztBQUNsRSxTQUFPOzs7O0NDSFIsSUFBYSxvQkFBYixNQUErQjtFQUMzQixPQUFPLGdCQUFnQixRQUEwQjtBQUM3QyxPQUFJLE9BQU8sV0FBVyxFQUFHLFFBQU87R0FDaEMsTUFBTSxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxHQUFHLE1BQU0sSUFBSSxFQUFFO0dBQ2hELE1BQU0sTUFBTSxLQUFLLE1BQU0sT0FBTyxTQUFTLEVBQUU7QUFDekMsVUFBTyxPQUFPLFNBQVMsTUFBTSxJQUFJLE9BQU8sUUFBUSxPQUFPLE1BQU0sS0FBSyxPQUFPLFFBQVE7O0VBR3JGLE9BQU8sVUFBVSxjQUFzQixjQUFpRjtBQUNwSCxPQUFJLGFBQWEsU0FBUyxFQUN0QixRQUFPO0lBQUUsT0FBTztJQUFJLFNBQVM7SUFBa0M7R0FFbkUsTUFBTSxTQUFTLGFBQWEsS0FBSSxNQUFLLEVBQUUsTUFBTTtHQUM3QyxNQUFN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