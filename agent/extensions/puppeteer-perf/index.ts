import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import puppeteer, { type Browser, type Page, type CDPSession } from "puppeteer";
import * as path from "node:path";
import * as fs from "node:fs/promises";

/**
 * Puppeteer-backed browser tool.
 *
 * One tool, two use shapes:
 *   1. Page-load measurement: pass `url`, optional `runs`, no `actions`.
 *      Returns Web Vitals + Navigation Timing (replaces the old perf_measure).
 *   2. Scripted scenario: pass `url` + `actions`. Each action is a small
 *      operation (click, hover, drag, evaluate, wait, measureFps, ...).
 *      Returns per-action results plus aggregated metrics from observers
 *      injected into the page.
 *
 * Designed for measuring map-renderer perf scenarios where pan/zoom/hover
 * matter as much as initial load — see the implementation plan in
 * .plans/2026-05-04-maplibre-martin-implementation.md.
 */

// ------------------------------------------------------------------
// Action schema
// ------------------------------------------------------------------
//
// Actions are intentionally a flat object with optional fields rather than
// a typebox discriminated union. The LLM generates these arrays directly,
// and a flat schema with field documentation is easier to call correctly
// than nested unions. We validate type-required-fields manually at runtime.
//
// Action types and their required fields:
//
//   goto        url, [waitUntil]
//   reload      [waitUntil]
//   click       selector, [button, count]
//   type        selector, text, [delay]
//   hover       selector
//   focus       selector
//   scroll      [selector], [deltaX], [deltaY]
//   drag        from:[x,y], to:[x,y], [steps]   — smooth pan gesture
//   mouseMove   x, y, [steps]
//   key         key                              — keyboard.press, e.g. "Enter"
//   wait        selector OR predicate, [timeout], [hidden]
//   sleep       ms
//   evaluate    script                           — returns value
//   screenshot  [path], [fullPage]
//   mark        name                             — performance.mark in page
//   measureFps  during:[Action,...]              — captures FPS while running sub-actions
//   resetMetrics                                  — clear longtasks / fps / marks since last reset

const ActionSchema = Type.Object(
	{
		type: Type.String({
			description:
				"Action kind. One of: goto, reload, click, type, hover, focus, scroll, drag, mouseMove, key, wait, sleep, evaluate, screenshot, mark, measureFps, resetMetrics.",
		}),
		// goto / reload
		url: Type.Optional(Type.String()),
		waitUntil: Type.Optional(
			Type.Union([
				Type.Literal("load"),
				Type.Literal("domcontentloaded"),
				Type.Literal("networkidle0"),
				Type.Literal("networkidle2"),
			]),
		),
		// click / type / hover / focus / wait
		selector: Type.Optional(Type.String()),
		button: Type.Optional(
			Type.Union([Type.Literal("left"), Type.Literal("right"), Type.Literal("middle")]),
		),
		count: Type.Optional(Type.Number()),
		text: Type.Optional(Type.String()),
		delay: Type.Optional(Type.Number()),
		// scroll
		deltaX: Type.Optional(Type.Number()),
		deltaY: Type.Optional(Type.Number()),
		// drag / mouseMove
		from: Type.Optional(Type.Array(Type.Number())),
		to: Type.Optional(Type.Array(Type.Number())),
		x: Type.Optional(Type.Number()),
		y: Type.Optional(Type.Number()),
		steps: Type.Optional(Type.Number()),
		// key
		key: Type.Optional(Type.String()),
		// wait
		predicate: Type.Optional(
			Type.String({
				description:
					"JS expression evaluated repeatedly in the page until truthy. Example: 'window.htmlPdfDone === true'.",
			}),
		),
		timeout: Type.Optional(Type.Number()),
		hidden: Type.Optional(Type.Boolean()),
		// sleep
		ms: Type.Optional(Type.Number()),
		// evaluate
		script: Type.Optional(
			Type.String({
				description:
					"JS expression or function body executed in the page. The return value is captured. Async functions and promises are awaited.",
			}),
		),
		// screenshot
		path: Type.Optional(Type.String()),
		fullPage: Type.Optional(Type.Boolean()),
		// mark
		name: Type.Optional(Type.String()),
		// measureFps
		during: Type.Optional(Type.Array(Type.Any())),
	},
	{ additionalProperties: false },
);

const SetupSchema = Type.Object(
	{
		viewport: Type.Optional(
			Type.Object({
				width: Type.Number(),
				height: Type.Number(),
				deviceScaleFactor: Type.Optional(Type.Number()),
			}),
		),
		userAgent: Type.Optional(Type.String()),
		extraHeaders: Type.Optional(Type.Record(Type.String(), Type.String())),
		cookies: Type.Optional(
			Type.Array(
				Type.Object({
					name: Type.String(),
					value: Type.String(),
					domain: Type.Optional(Type.String()),
					path: Type.Optional(Type.String()),
					url: Type.Optional(Type.String()),
				}),
			),
		),
		// localStorage entries are set via an init script that runs on every
		// document. Keys/values are strings.
		localStorage: Type.Optional(Type.Record(Type.String(), Type.String())),
		// Saved as an init script; useful for stubbing window globals before
		// any page JS runs.
		initScript: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ParamsSchema = Type.Object({
	url: Type.Optional(
		Type.String({
			description:
				"Initial URL. Equivalent to a leading {type:'goto', url} action. Optional if the first action is a goto.",
		}),
	),
	actions: Type.Optional(Type.Array(ActionSchema)),
	setup: Type.Optional(SetupSchema),
	runs: Type.Optional(Type.Number({ description: "Number of runs to average. Default 1.", default: 1 })),
	cpuThrottle: Type.Optional(Type.Number({ description: "CPU slowdown multiplier, e.g. 4. Default 1.", default: 1 })),
	networkPreset: Type.Optional(
		Type.Union([Type.Literal("none"), Type.Literal("Fast 3G"), Type.Literal("Slow 3G")], {
			default: "none",
		}),
	),
	headful: Type.Optional(Type.Boolean({ default: false })),
	timeout: Type.Optional(
		Type.Number({ description: "Per-run timeout in ms. Default 60000.", default: 60000 }),
	),
	captureWebVitals: Type.Optional(Type.Boolean({ default: true })),
	captureLongTasks: Type.Optional(Type.Boolean({ default: true })),
	captureResources: Type.Optional(Type.Boolean({ default: false })),
	resourceFilter: Type.Optional(
		Type.String({ description: "Regex; only resources whose URL matches are returned." }),
	),
	captureHeap: Type.Optional(Type.Boolean({ default: false })),
	// In multi-run mode, return only summary by default; full per-run detail in `details`.
});

// ------------------------------------------------------------------
// Page agent — runs inside the page, set up via evaluateOnNewDocument
// ------------------------------------------------------------------
//
// Installs PerformanceObservers for longtask, layout-shift, and LCP, and
// exposes window.__pi_perf with helpers that the host calls via evaluate.

const PAGE_AGENT_SOURCE = String.raw`
(() => {
  if (window.__pi_perf) return;
  const state = {
    longTasks: [],
    layoutShifts: [],
    lcp: 0,
    fcp: 0,
    fpsRuns: [],
    activeFps: null,
  };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        state.longTasks.push({ startTime: e.startTime, duration: e.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) state.layoutShifts.push({ startTime: e.startTime, value: e.value });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) state.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch (_) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === "first-contentful-paint") state.fcp = e.startTime;
      }
    }).observe({ type: "paint", buffered: true });
  } catch (_) {}

  window.__pi_perf = {
    state,
    reset() {
      state.longTasks.length = 0;
      state.layoutShifts.length = 0;
      state.fpsRuns.length = 0;
      // intentionally don't reset lcp/fcp — these are page-load metrics
    },
    captureFps(durationMs, label) {
      // Legacy fixed-duration capture, retained for backwards compat.
      return new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        function tick() {
          frames++;
          const now = performance.now();
          if (now - start >= durationMs) {
            const elapsed = now - start;
            const result = {
              label: label || null,
              fps: (frames * 1000) / elapsed,
              frames,
              durationMs: elapsed,
            };
            state.fpsRuns.push(result);
            resolve(result);
          } else {
            requestAnimationFrame(tick);
          }
        }
        requestAnimationFrame(tick);
      });
    },
    // Start a manually-stopped FPS capture. Returns immediately. Only one active
    // capture at a time — a second start without a stop replaces the first.
    startFps(label) {
      const run = { label: label || null, frames: 0, start: performance.now(), rafId: 0, stopped: false };
      function tick() {
        if (run.stopped) return;
        run.frames++;
        run.rafId = requestAnimationFrame(tick);
      }
      run.rafId = requestAnimationFrame(tick);
      state.activeFps = run;
      return true;
    },
    // Stop the active FPS capture; push and return the result. Returns null if
    // no active capture or if the window was too short to be meaningful.
    stopFps() {
      const run = state.activeFps;
      if (!run) return null;
      run.stopped = true;
      try { cancelAnimationFrame(run.rafId); } catch (_) {}
      state.activeFps = null;
      const elapsed = performance.now() - run.start;
      const result = {
        label: run.label,
        fps: elapsed > 0 ? (run.frames * 1000) / elapsed : 0,
        frames: run.frames,
        durationMs: elapsed,
      };
      state.fpsRuns.push(result);
      return result;
    },
    snapshot(opts) {
      opts = opts || {};
      const out = {
        longTasks: state.longTasks.slice(0, 200),
        longTaskCount: state.longTasks.length,
        longTaskTotalMs: state.longTasks.reduce((a, b) => a + b.duration, 0),
        maxLongTaskMs: state.longTasks.reduce((m, b) => Math.max(m, b.duration), 0),
        layoutShifts: state.layoutShifts.length,
        cls: state.layoutShifts.reduce((a, b) => a + b.value, 0),
        lcp: state.lcp,
        fcp: state.fcp,
        fpsRuns: state.fpsRuns.slice(),
        marks: {},
        measures: {},
      };
      try {
        for (const m of performance.getEntriesByType("mark")) out.marks[m.name] = m.startTime;
        for (const m of performance.getEntriesByType("measure")) out.measures[m.name] = m.duration;
      } catch (_) {}
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        out.nav = {
          ttfb: nav.responseStart - nav.requestStart,
          domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
          loadEvent: nav.loadEventEnd - nav.startTime,
          transferSize: nav.transferSize,
        };
      }
      if (opts.resources) {
        const re = opts.resourceFilter ? new RegExp(opts.resourceFilter) : null;
        out.resources = performance.getEntriesByType("resource")
          .filter((r) => !re || re.test(r.name))
          .map((r) => ({
            name: r.name,
            duration: r.duration,
            transferSize: r.transferSize,
            decodedBodySize: r.decodedBodySize,
            initiatorType: r.initiatorType,
            startTime: r.startTime,
          }));
      }
      if (opts.heap && performance.memory) {
        out.heap = {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        };
      }
      return out;
    },
  };
})();
`;

// ------------------------------------------------------------------
// Action runner
// ------------------------------------------------------------------

interface RunContext {
	page: Page;
	signal?: AbortSignal;
	captureRoot: string; // for screenshot output
}

interface ActionResult {
	index: number;
	type: string;
	durationMs: number;
	success: boolean;
	error?: string;
	value?: unknown;
	fps?: { fps: number; frames: number; durationMs: number; label: string | null };
	screenshotPath?: string;
}

async function runAction(
	action: Record<string, any>,
	idx: number,
	ctx: RunContext,
): Promise<ActionResult> {
	const t0 = Date.now();
	const result: ActionResult = { index: idx, type: action.type, durationMs: 0, success: false };
	try {
		switch (action.type) {
			case "goto": {
				if (!action.url) throw new Error("goto requires url");
				await ctx.page.goto(action.url, {
					waitUntil: action.waitUntil ?? "networkidle2",
					timeout: action.timeout ?? 30000,
				});
				break;
			}
			case "reload": {
				await ctx.page.reload({
					waitUntil: action.waitUntil ?? "networkidle2",
					timeout: action.timeout ?? 30000,
				});
				break;
			}
			case "click": {
				if (!action.selector) throw new Error("click requires selector");
				await ctx.page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
				await ctx.page.click(action.selector, {
					button: action.button,
					count: action.count,
				});
				break;
			}
			case "type": {
				if (!action.selector || action.text == null)
					throw new Error("type requires selector and text");
				await ctx.page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
				await ctx.page.type(action.selector, action.text, { delay: action.delay });
				break;
			}
			case "hover": {
				if (!action.selector) throw new Error("hover requires selector");
				await ctx.page.waitForSelector(action.selector, { timeout: action.timeout ?? 10000 });
				await ctx.page.hover(action.selector);
				break;
			}
			case "focus": {
				if (!action.selector) throw new Error("focus requires selector");
				await ctx.page.focus(action.selector);
				break;
			}
			case "scroll": {
				const dx = action.deltaX ?? 0;
				const dy = action.deltaY ?? 0;
				if (action.selector) {
					await ctx.page.evaluate(
						(sel: string, x: number, y: number) => {
							const el = document.querySelector(sel) as HTMLElement | null;
							if (el) el.scrollBy(x, y);
						},
						action.selector,
						dx,
						dy,
					);
				} else {
					await ctx.page.evaluate(
						(x: number, y: number) => window.scrollBy(x, y),
						dx,
						dy,
					);
				}
				break;
			}
			case "drag": {
				if (!action.from || !action.to) throw new Error("drag requires from and to");
				const [fx, fy] = action.from;
				const [tx, ty] = action.to;
				const steps = action.steps ?? 20;
				await ctx.page.mouse.move(fx, fy);
				await ctx.page.mouse.down();
				await ctx.page.mouse.move(tx, ty, { steps });
				await ctx.page.mouse.up();
				break;
			}
			case "mouseMove": {
				if (action.x == null || action.y == null) throw new Error("mouseMove requires x and y");
				await ctx.page.mouse.move(action.x, action.y, { steps: action.steps ?? 1 });
				break;
			}
			case "key": {
				if (!action.key) throw new Error("key requires key");
				await ctx.page.keyboard.press(action.key);
				break;
			}
			case "wait": {
				if (action.selector) {
					await ctx.page.waitForSelector(action.selector, {
						timeout: action.timeout ?? 30000,
						hidden: action.hidden ?? false,
					});
				} else if (action.predicate) {
					await ctx.page.waitForFunction(action.predicate, {
						timeout: action.timeout ?? 30000,
					});
				} else {
					throw new Error("wait requires selector or predicate");
				}
				break;
			}
			case "sleep": {
				if (action.ms == null) throw new Error("sleep requires ms");
				await new Promise((r) => setTimeout(r, action.ms));
				break;
			}
			case "evaluate": {
				if (!action.script) throw new Error("evaluate requires script");
				// Support two shapes:
				//   - expression: "document.title"            → returned
				//   - body with statements: "foo(); return 1" → returned (or undefined if no return)
				// Try expression-form first; on SyntaxError fall back to body-form.
				const expr = `(async () => { return (${action.script}); })()`;
				const body = `(async () => { ${action.script} })()`;
				try {
					result.value = await ctx.page.evaluate(expr);
				} catch (e: any) {
					const msg = e?.message ?? String(e);
					if (/SyntaxError|Unexpected token|Unexpected identifier|missing \) after/i.test(msg)) {
						result.value = await ctx.page.evaluate(body);
					} else {
						throw e;
					}
				}
				break;
			}
			case "screenshot": {
				const target =
					action.path ||
					path.join(ctx.captureRoot, `screenshot-${Date.now()}-${idx}.png`);
				await fs.mkdir(path.dirname(target), { recursive: true });
				await ctx.page.screenshot({ path: target as `${string}.png`, fullPage: !!action.fullPage });
				result.screenshotPath = target;
				break;
			}
			case "mark": {
				if (!action.name) throw new Error("mark requires name");
				await ctx.page.evaluate((n: string) => performance.mark(n), action.name);
				break;
			}
			case "measureFps": {
				const sub = (action.during ?? []) as Record<string, any>[];
				if (sub.length === 0) throw new Error("measureFps requires during:[...]");
				const label = action.name ?? `fps-${idx}`;
				// Start an open-ended in-page FPS capture, run the sub-actions,
				// then stop the capture and read its result. This gives us the
				// FPS for exactly the sub-action window — no fixed-duration race,
				// no dangling background eval.
				await ctx.page.evaluate(
					(l: string) => (window as any).__pi_perf.startFps(l),
					label,
				);
				const subResults: ActionResult[] = [];
				try {
					for (let i = 0; i < sub.length; i++) {
						subResults.push(await runAction(sub[i], i, ctx));
					}
				} finally {
					const stopped = await ctx.page
						.evaluate(() => (window as any).__pi_perf.stopFps())
						.catch(() => null);
					result.fps = stopped ?? undefined;
				}
				result.value = subResults;
				break;
			}
			case "resetMetrics": {
				await ctx.page.evaluate(() => (window as any).__pi_perf.reset());
				break;
			}
			default:
				throw new Error(`unknown action type: ${action.type}`);
		}
		result.success = true;
	} catch (e: any) {
		result.success = false;
		result.error = e?.message ?? String(e);
	}
	result.durationMs = Date.now() - t0;
	return result;
}

// ------------------------------------------------------------------
// Single-run driver
// ------------------------------------------------------------------

async function runOnce(browser: Browser, params: any, runIndex: number, captureRoot: string) {
	const page = await browser.newPage();
	const client: CDPSession = await page.target().createCDPSession();

	if (params.cpuThrottle && params.cpuThrottle > 1) {
		await client.send("Emulation.setCPUThrottlingRate", { rate: params.cpuThrottle });
	}
	if (params.networkPreset && params.networkPreset !== "none") {
		const presets: Record<string, any> = {
			"Fast 3G": {
				downloadThroughput: (1.6 * 1024 * 1024) / 8,
				uploadThroughput: (750 * 1024) / 8,
				latency: 150,
			},
			"Slow 3G": {
				downloadThroughput: (500 * 1024) / 8,
				uploadThroughput: (500 * 1024) / 8,
				latency: 400,
			},
		};
		await client.send("Network.emulateNetworkConditions", {
			offline: false,
			...presets[params.networkPreset],
		});
	}

	const setup = params.setup ?? {};
	if (setup.viewport) await page.setViewport(setup.viewport);
	if (setup.userAgent) await page.setUserAgent(setup.userAgent);
	if (setup.extraHeaders) await page.setExtraHTTPHeaders(setup.extraHeaders);
	if (setup.cookies && setup.cookies.length) {
		// puppeteer 24: setCookie is on the page in v24; fallback to client if not.
		// @ts-ignore
		if (typeof page.setCookie === "function") {
			// @ts-ignore
			await page.setCookie(...setup.cookies);
		} else {
			// @ts-ignore
			await browser.setCookie(...setup.cookies);
		}
	}
	// Init scripts: page agent first, then localStorage seed, then user script.
	await page.evaluateOnNewDocument(PAGE_AGENT_SOURCE);
	if (setup.localStorage) {
		const ls = setup.localStorage;
		await page.evaluateOnNewDocument((entries: Record<string, string>) => {
			try {
				for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
			} catch (_) {}
		}, ls);
	}
	if (setup.initScript) {
		await page.evaluateOnNewDocument(setup.initScript);
	}

	const actions: Record<string, any>[] = [];
	if (params.url) actions.push({ type: "goto", url: params.url });
	if (Array.isArray(params.actions)) actions.push(...params.actions);

	const t0 = Date.now();
	const ctx: RunContext = { page, captureRoot };
	const actionResults: ActionResult[] = [];
	for (let i = 0; i < actions.length; i++) {
		const r = await runAction(actions[i], i, ctx);
		actionResults.push(r);
		if (!r.success) break; // fail fast within a run
	}
	const wallMs = Date.now() - t0;

	// Final snapshot
	const snapshot = await page.evaluate(
		(opts: any) => (window as any).__pi_perf.snapshot(opts),
		{ resources: !!params.captureResources, resourceFilter: params.resourceFilter, heap: !!params.captureHeap },
	);

	await page.close();

	return {
		run: runIndex + 1,
		wallMs,
		actions: actionResults,
		webVitals: params.captureWebVitals
			? { ttfb: snapshot.nav?.ttfb ?? null, fcp: snapshot.fcp, lcp: snapshot.lcp, cls: snapshot.cls }
			: undefined,
		nav: snapshot.nav,
		longTasks: params.captureLongTasks
			? {
					count: snapshot.longTaskCount,
					totalMs: snapshot.longTaskTotalMs,
					maxMs: snapshot.maxLongTaskMs,
				}
			: undefined,
		fpsRuns: snapshot.fpsRuns,
		marks: snapshot.marks,
		measures: snapshot.measures,
		resources: snapshot.resources,
		heap: snapshot.heap,
	};
}

// ------------------------------------------------------------------
// Aggregation
// ------------------------------------------------------------------

function avg(vals: (number | null | undefined)[]): number | null {
	const xs = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function summarize(runs: any[]) {
	return {
		runs: runs.length,
		averages: {
			ttfb: avg(runs.map((r) => r.webVitals?.ttfb)),
			fcp: avg(runs.map((r) => r.webVitals?.fcp)),
			lcp: avg(runs.map((r) => r.webVitals?.lcp)),
			cls: avg(runs.map((r) => r.webVitals?.cls)),
			wallMs: avg(runs.map((r) => r.wallMs)),
			longTaskCount: avg(runs.map((r) => r.longTasks?.count)),
			longTaskTotalMs: avg(runs.map((r) => r.longTasks?.totalMs)),
			maxLongTaskMs: avg(runs.map((r) => r.longTasks?.maxMs)),
		},
		fps: aggregateFps(runs),
		actionFailures: runs.flatMap((r) =>
			(r.actions ?? [])
				.filter((a: ActionResult) => !a.success)
				.map((a: ActionResult) => ({ run: r.run, index: a.index, type: a.type, error: a.error })),
		),
	};
}

function aggregateFps(runs: any[]) {
	// Group fps captures by label across runs, then average.
	const byLabel: Record<string, { fps: number; frames: number; durationMs: number }[]> = {};
	for (const r of runs) {
		for (const f of r.fpsRuns ?? []) {
			const key = f.label || "(unlabeled)";
			(byLabel[key] ??= []).push(f);
		}
	}
	return Object.fromEntries(
		Object.entries(byLabel).map(([label, samples]) => [
			label,
			{
				samples: samples.length,
				avgFps: avg(samples.map((s) => s.fps)),
				minFps: Math.min(...samples.map((s) => s.fps)),
				maxFps: Math.max(...samples.map((s) => s.fps)),
				avgDurationMs: avg(samples.map((s) => s.durationMs)),
			},
		]),
	);
}

// ------------------------------------------------------------------
// Tool registration
// ------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "browser",
		label: "Browser",
		description: [
			"Drive headless Chrome via Puppeteer. Use for end-to-end browser automation, scripted UI scenarios, and performance measurement (Web Vitals, long tasks, FPS during interactions, custom performance marks).",
			"",
			"Two main shapes:",
			"  1. Page-load measurement: pass `url` (and optionally `runs`). Returns Web Vitals + Navigation Timing.",
			"  2. Scripted scenario: pass `url` plus an `actions` array. Each action is an object with a `type` field plus type-specific fields. Common types:",
			"     - {type:'goto', url, waitUntil?}",
			"     - {type:'click', selector}",
			"     - {type:'type', selector, text}",
			"     - {type:'hover', selector}",
			"     - {type:'wait', selector?, predicate?, timeout?}  (predicate is a JS expression evaluated in-page)",
			"     - {type:'sleep', ms}",
			"     - {type:'drag', from:[x,y], to:[x,y], steps?}      (smooth pan gesture for maps)",
			"     - {type:'evaluate', script}                        (returns the value)",
			"     - {type:'mark', name}                              (performance.mark in page)",
			"     - {type:'measureFps', name?, during:[...sub-actions]}  (captures FPS while running sub-actions)",
			"     - {type:'screenshot', path?, fullPage?}",
			"     - {type:'resetMetrics'}                            (clear longtasks/fps since last reset; useful before a critical interaction)",
			"",
			"Auth: pass `setup.cookies`, `setup.localStorage`, or `setup.extraHeaders` (e.g. `{Authorization:'Bearer ...'}`) to authenticate before any goto.",
			"",
			"Returns per-action results plus aggregated metrics (web vitals, long-task counts, FPS samples grouped by label, performance marks/measures, resource timing if requested).",
		].join("\n"),
		promptSnippet:
			"Drive a real browser to script user flows, run UI scenarios, or measure interaction performance (FPS during pan/zoom, long tasks, custom marks).",
		promptGuidelines: [
			"Use browser when the user asks to script a browser interaction, automate a page, capture screenshots, or measure interaction performance (not just initial page load).",
			"Use browser instead of perf_measure when the user needs FPS during pan/zoom, long-task counts during a scenario, or custom performance marks.",
			"For auth-gated apps, set the Authorization header via setup.extraHeaders, or load cookies via setup.cookies, before the first goto.",
		],
		parameters: ParamsSchema,

		async execute(_toolCallId, params, signal, onUpdate) {
			const runs = params.runs ?? 1;
			const captureRoot = path.join(process.cwd(), ".browser-tool");
			const browser = await puppeteer.launch({
				headless: !params.headful,
				args: ["--no-sandbox", "--disable-dev-shm-usage"],
			});

			// Abort propagation: if the user aborts, close the browser. The
			// Promise.race below will see runOnce reject with a TargetCloseError
			// which we recognise and rewrite as a clean abort.
			const onAbort = () => { browser.close().catch(() => {}); };
			signal?.addEventListener?.("abort", onAbort);

			const allRuns: any[] = [];
			try {
				for (let i = 0; i < runs; i++) {
					if (signal?.aborted) throw new Error("aborted");
					onUpdate?.({ content: [{ type: "text", text: `Run ${i + 1}/${runs}…` }], details: {} });
					let timer: NodeJS.Timeout | undefined;
					try {
						const r = await Promise.race([
							runOnce(browser, params, i, captureRoot),
							new Promise((_, rej) => {
								timer = setTimeout(
									() => rej(new Error(`run timeout after ${params.timeout ?? 60_000}ms`)),
									params.timeout ?? 60_000,
								);
							}),
						]);
						allRuns.push(r);
					} catch (e: any) {
						// Rewrite TargetCloseError that occurs because we just closed
						// the browser (timeout / abort) into a clearer message, and
						// stop processing further runs.
						const msg = e?.message ?? String(e);
						if (/Target closed|Session closed|Connection closed/i.test(msg)) {
							throw new Error(
								signal?.aborted
									? "aborted"
									: `run ${i + 1} aborted (browser closed mid-action — likely run timeout; raise params.timeout)`,
							);
						}
						throw e;
					} finally {
						if (timer) clearTimeout(timer);
					}
				}
			} finally {
				signal?.removeEventListener?.("abort", onAbort);
				await browser.close().catch(() => {});
			}

			const summary = summarize(allRuns);
			// Trim heavy fields out of the LLM-visible content; keep them in details.
			const trimmedRuns = allRuns.map((r) => ({
				...r,
				resources: undefined,
			}));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary,
								runs: trimmedRuns,
							},
							null,
							2,
						),
					},
				],
				details: { summary, runs: allRuns, params },
			};
		},
	});

	// Backwards-compat: keep `perf_measure` as a thin alias for the page-load
	// shape. Anyone (or any older skill) that referenced perf_measure still
	// works. New code should prefer `browser`.
	pi.registerTool({
		name: "perf_measure",
		label: "E2E Perf",
		description:
			"Load a URL in headless Chrome and return Web Vitals + Navigation Timing. Thin wrapper over the `browser` tool with no actions. For scripted scenarios or interaction-perf, use `browser` instead.",
		promptSnippet: "Measure page load performance (LCP, FCP, TTFB, CLS) for a URL.",
		promptGuidelines: [
			"Use perf_measure when the user only needs cold-load metrics for a URL with no interaction. For anything scripted, use the browser tool.",
		],
		parameters: Type.Object({
			url: Type.String(),
			runs: Type.Optional(Type.Number({ default: 1 })),
			cpuThrottle: Type.Optional(Type.Number({ default: 1 })),
			networkPreset: Type.Optional(
				Type.Union([Type.Literal("none"), Type.Literal("Fast 3G"), Type.Literal("Slow 3G")], {
					default: "none",
				}),
			),
			waitUntil: Type.Optional(
				Type.Union([
					Type.Literal("load"),
					Type.Literal("domcontentloaded"),
					Type.Literal("networkidle0"),
					Type.Literal("networkidle2"),
				]),
			),
			headful: Type.Optional(Type.Boolean({ default: false })),
		}),
		async execute(_toolCallId, params, signal, onUpdate) {
			const captureRoot = path.join(process.cwd(), ".browser-tool");
			const browser = await puppeteer.launch({
				headless: !params.headful,
				args: ["--no-sandbox", "--disable-dev-shm-usage"],
			});
			const allRuns: any[] = [];
			try {
				const wrapped = {
					url: undefined,
					actions: [{ type: "goto", url: params.url, waitUntil: params.waitUntil ?? "networkidle2" }],
					cpuThrottle: params.cpuThrottle,
					networkPreset: params.networkPreset,
					captureWebVitals: true,
					captureLongTasks: false,
				};
				for (let i = 0; i < (params.runs ?? 1); i++) {
					if (signal?.aborted) throw new Error("aborted");
					onUpdate?.({ content: [{ type: "text", text: `Run ${i + 1}/${params.runs ?? 1}…` }], details: {} });
					const r = await runOnce(browser, wrapped, i, captureRoot);
					allRuns.push(r);
				}
			} finally {
				await browser.close();
			}
			const summary = {
				url: params.url,
				runs: allRuns.length,
				averages: {
					ttfb: avg(allRuns.map((r) => r.webVitals?.ttfb)),
					fcp: avg(allRuns.map((r) => r.webVitals?.fcp)),
					lcp: avg(allRuns.map((r) => r.webVitals?.lcp)),
					cls: avg(allRuns.map((r) => r.webVitals?.cls)),
					wallMs: avg(allRuns.map((r) => r.wallMs)),
				},
			};
			return {
				content: [{ type: "text", text: JSON.stringify({ summary, runs: allRuns }, null, 2) }],
				details: { summary, runs: allRuns },
			};
		},
	});
}
