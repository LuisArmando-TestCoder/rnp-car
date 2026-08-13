import { chromium } from "playwright";
import { RnpFormOptions } from "./types";
import { performSecureLogin, safeLogout } from "./auth";
import { getFirstCredential } from "./credentials";
import { logger, setLogStream } from "./logger";

const LOGIN = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const VEH = "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaVehiculo.jspx";

export async function extractVehicleFormOptions(
  opts: { credentials?: { user: string; pass: string }; headless?: boolean; timeoutMs?: number } = {}
): Promise<RnpFormOptions> {
  const { headless = true, timeoutMs = 60000 } = opts;
  const logs: string[] = [];
  setLogStream((e) => logs.push(`[${e.timestamp}] [${e.level.toUpperCase()}] [${e.scope}] ${e.message}`));
  const env = getFirstCredential();
  const user = opts.credentials?.user || env?.user;
  const pass = opts.credentials?.pass || env?.pass;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.goto(LOGIN, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (user && pass) {
      const ok = await performSecureLogin(page, user, pass);
      if (!ok) return { codeClasses: [], searchTypes: [], documentTypes: [], vehicleTypes: [], reachable: false, error: "Login failed or WAF blocked" };
    }
    await page.goto(VEH, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/rejected|support id/i.test(body)) {
      return { codeClasses: [], searchTypes: [], documentTypes: [], vehicleTypes: [], reachable: false, error: "WAF blocked the request" };
    }
    const selects = page.locator("select");
    const n = await selects.count();
    const out: RnpFormOptions = { codeClasses: [], searchTypes: [], documentTypes: [], vehicleTypes: [], reachable: true };
    for (let i = 0; i < n; i++) {
      const optsArr = await selects.nth(i).locator("option").allTextContents();
      const clean = optsArr.map((t) => t.trim()).filter(Boolean);
      if (i === 0) out.searchTypes = clean;
      else if (i === 1) out.documentTypes = clean;
      else if (i === 2) out.vehicleTypes = clean;
      else out.codeClasses = clean;
    }
    return out;
  } catch (err) {
    return { codeClasses: [], searchTypes: [], documentTypes: [], vehicleTypes: [], reachable: false, error: err instanceof Error ? err.message : String(err) };
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
