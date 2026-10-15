import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

export function portalURL(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("portal must be an http://127.0.0.1:<port>/ origin");
  return url;
}

export class BrowserSession {
  constructor(browser, context, page, url, captureDir, signal, abort) {
    Object.assign(this, { browser, context, page, url, captureDir, signal, abort });
    this.step = 0; this.trace = []; this.blockedRequests = [];
  }
  static async open(baseUrl, captureDir, { signal } = {}) {
    const url = portalURL(baseUrl);
    signal?.throwIfAborted();
    fs.mkdirSync(captureDir, { recursive: true, mode: 0o700 });
    const browser = await chromium.launch({ headless: true, timeout: 10_000 });
    const abort = () => { void browser.close().catch(() => {}); };
    signal?.addEventListener("abort", abort, { once: true });
    let session;
    try {
      signal?.throwIfAborted();
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: false, javaScriptEnabled: false });
      context.setDefaultTimeout(4000); context.setDefaultNavigationTimeout(5000);
      const page = await context.newPage();
      session = new BrowserSession(browser, context, page, url, captureDir, signal, abort);
      await context.route("**/*", async (route) => {
        const target = new URL(route.request().url());
        if (target.origin === url.origin && !target.username && !target.password) return route.continue();
        session.blockedRequests.push({ url: target.href, kind: "http" });
        await route.abort("blockedbyclient");
      });
      await context.routeWebSocket("**/*", (socket) => { session.blockedRequests.push({ url: socket.url(), kind: "websocket" }); socket.close(); });
      context.on("page", (popup) => { if (popup !== page) { session.blockedRequests.push({ kind: "popup", url: popup.url() }); void popup.close().catch(() => {}); } });
      page.on("download", (download) => { session.blockedRequests.push({ kind: "download", url: download.url() }); void download.cancel().catch(() => {}); });
      page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => {}); });
      await page.goto(url.href, { waitUntil: "networkidle" });
      session.assertLocal();
      return session;
    } catch (error) {
      try { await browser.close(); } catch (cleanupError) { error.cleanup_error = cleanupError.message; }
      error.startup_evidence = { browser_closed: !browser.isConnected(), blocked_requests: session?.blockedRequests || [], ...(error.cleanup_error ? { cleanup_error: error.cleanup_error } : {}) };
      signal?.removeEventListener("abort", abort);
      throw error;
    }
  }
  assertLocal() {
    this.signal?.throwIfAborted();
    if (new URL(this.page.url()).origin !== this.url.origin || this.blockedRequests.length) throw new Error("browser blocked an operation outside the configured portal");
  }
  async observe(action = "inspect") {
    this.assertLocal();
    const screenshot = path.join(this.captureDir, `step-${String(this.step++).padStart(2, "0")}.png`);
    await this.page.screenshot({ path: screenshot, fullPage: true, timeout: 4000 });
    const body = await this.page.locator("body").innerText();
    const controls = await this.page.locator("a,button,input:not([type=hidden]),select").evaluateAll((elements) => elements.map((el) => ({
      tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().slice(0, 200),
      label: Array.from(el.labels || []).map((label) => label.textContent.trim()).join(" "),
      value: "value" in el ? String(el.value) : "", href: el.getAttribute("href"),
    })));
    const meta = this.page.locator('meta[name="atlas-snapshot"]');
    const snapshot = await meta.count() ? await meta.getAttribute("content") : null;
    const view = { snapshot: snapshot ? JSON.parse(snapshot) : null, url: this.page.url(), title: await this.page.title(), text: body.slice(0, 10000), text_truncated: body.length > 10000,
      controls: controls.slice(0, 80), controls_truncated: controls.length > 80,
      alerts: await this.page.getByRole("alert").allTextContents(), screenshot };
    this.trace.push({ action, ...view }); return view;
  }
  async execute(name, args) {
    try {
      this.assertLocal();
      if (name === "browser_inspect") return await this.observe();
      if (name === "browser_click") await this.page.getByRole(args.role, { name: args.name, exact: true }).click();
      else if (name === "browser_fill") await this.page.getByLabel(args.label, { exact: true }).fill(args.value);
      else if (name === "browser_select") await this.page.getByLabel(args.label, { exact: true }).selectOption({ label: args.option });
      else throw new Error("unknown browser tool");
      await this.page.waitForLoadState("networkidle");
      const view = await this.observe(`${name} ${JSON.stringify(args)}`);
      const invalid = await this.page.locator("input:invalid,select:invalid").count();
      if (view.alerts.length || (name === "browser_click" && invalid)) return { ...view, error: view.alerts.join("; ") || "form validation failed" };
      return view;
    } catch (error) {
      let view = {};
      try { view = await this.observe(`failed ${name}`); }
      catch (captureError) { view.capture_error = captureError.message; }
      return { ...view, error: error.message };
    }
  }
  async close() {
    try { await this.browser.close(); }
    finally { this.signal?.removeEventListener("abort", this.abort); }
  }
}
