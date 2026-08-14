import { RnpPolizaFormOptions } from "./types";
import { performSecureLogin, safeLogout } from "./auth";
import { getFirstCredential } from "./credentials";
import { logger, setLogStream } from "./logger";

const LOGIN = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const POLIZA_URL =
  "https://www.rnpdigital.com/shopping/consultaDocumentos/bienesMuebles/paramConsultaPoliza.jspx";

export async function extractPolizaFormOptions(
  opts: { credentials?: { user: string; pass: string }; headless?: boolean; timeoutMs?: number } = {}
): Promise<RnpPolizaFormOptions> {
  const { headless = true, timeoutMs = 60000 } = opts;
  const logs: string[] = [];
  setLogStream((e) => logs.push(`[${e.timestamp}] [${e.level.toUpperCase()}] [${e.scope}] ${e.message}`));
  const env = getFirstCredential();
  const user = opts.credentials?.user || env?.user;
  const pass = opts.credentials?.pass || env?.pass;
  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (user && pass) {
      const ok = await performSecureLogin(page, user, pass);
      if (!ok) return { searchTypes: [], aduanas: [], reachable: false, error: "Login failed or WAF blocked" };
    }
    await page.goto(POLIZA_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/rejected|support id/i.test(body)) {
      return { searchTypes: [], aduanas: [], reachable: false, error: "WAF blocked the request" };
    }
    const selects = page.locator("select");
    const n = await selects.count();
    const out: RnpPolizaFormOptions = { searchTypes: [], aduanas: [], reachable: true };
    for (let i = 0; i < n; i++) {
      const optsArr = await selects.nth(i).locator("option").allTextContents();
      const values = await selects.nth(i).locator("option").evaluateAll((els) =>
        els.map((el) => ({ value: (el as HTMLOptionElement).value, label: el.textContent?.trim() || "" }))
      );
      if (i === 0) out.searchTypes = optsArr.map((t) => t.trim()).filter(Boolean);
      else if (i === 1) out.aduanas = values.filter((v) => v.label);
    }
    return out;
  } catch (err) {
    return {
      searchTypes: [],
      aduanas: [],
      reachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (browser) {
      try {
        const pages = browser.contexts()[0]?.pages();
        if (pages?.length) await safeLogout(pages[0]);
        await browser.close();
      } catch { await browser.close().catch(() => {}); }
    }
    setLogStream(null);
  }
}
