import { chromium } from "playwright";
import { config } from "dotenv";
import { getFirstCredential } from "../src/lib/rnp/credentials";
import { performSecureLogin } from "../src/lib/rnp/auth";
import { logger, setLogStream } from "../src/lib/rnp/logger";
config();

const TEST_VIN = "MMBJLKL10NH027545";

async function main() {
  setLogStream((e) => console.log(`[${e.timestamp}] [${e.level.toUpperCase()}] [${e.scope}] ${e.message}`));

  const cred = getFirstCredential();
  if (!cred) {
    console.error("Missing credentials. Check RNP_CREDENTIALS in .env");
    process.exit(1);
  }

  logger.info("LOGIN-ONLY", `Starting login-only test as ${cred.user}`);

  // Visible browser so we can watch the login
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    logger.info("LOGIN-ONLY", "Opening RNP Digital login page...");
    await page.goto("https://www.rnpdigital.com/shopping/login.jspx", { waitUntil: "domcontentloaded" });

    logger.info("LOGIN-ONLY", "Performing secure login...");
    const loggedIn = await performSecureLogin(page, cred.user, cred.pass);
    logger.info("LOGIN-ONLY", `Login result: ${loggedIn} — URL: ${page.url()}`);

    // Navigate directly to the free consultations index (image/JSF menu clicks are unreliable)
    logger.info("LOGIN-ONLY", "Navigating to Consultas Gratuitas index...");
    await page.goto("https://www.rnpdigital.com/shopping/consultaDocumentos/indiceDocumentos.jspx", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    logger.info("LOGIN-ONLY", `After index navigation URL: ${page.url()}`);

    // Navigate directly to the vehicle consultation form
    logger.info("LOGIN-ONLY", "Navigating to Consulta de Vehículo...");
    await page.goto("https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaVehiculo.jspx", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    logger.info("LOGIN-ONLY", `After vehicle navigation URL: ${page.url()}`);
    await page.waitForTimeout(2500);

    // Dump the form's select options + input fields so we can build the right selectors
    const formDebug = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll("select")).map((s) => ({
        id: s.id,
        name: s.name,
        opts: Array.from(s.options).map((o) => o.text?.trim()),
      }));
      const inputs = Array.from(document.querySelectorAll("input")).map((el: any) => ({
        type: el.type,
        id: el.id,
        name: el.name,
      }));
      return { selects, inputs };
    }).catch((e) => ({ error: String(e) }));
    logger.info("LOGIN-ONLY", `FORM DEBUG:\n${JSON.stringify(formDebug, null, 2)}`);

    // Select "Número de VIN" in the Tipo de Búsqueda dropdown
    logger.info("LOGIN-ONLY", "Selecting 'Número de VIN'...");
    const typeSelect = page.locator("select").first();
    await typeSelect.selectOption({ label: "Número de VIN" }).catch(async () => {
      // Fallback: select by index of option containing VIN
      const opts = await typeSelect.locator("option").allTextContents();
      const idx = opts.findIndex((t) => /VIN/i.test(t));
      if (idx >= 0) await typeSelect.selectOption({ index: idx });
    });
    await page.waitForTimeout(600);

    // Fill the VIN into the text input (clear first)
    logger.info("LOGIN-ONLY", `Filling VIN: ${TEST_VIN}`);
    const vinInput = page.locator("input[type='text']").last();
    await vinInput.fill("");
    await vinInput.fill(TEST_VIN);
    await page.waitForTimeout(600);

    // Click the Consultar image button
    logger.info("LOGIN-ONLY", "Clicking 'Consultar'...");
    const consultarBtn = page.locator("img[src*='btn-consultar'], img[alt='Consultar']").first();
    await consultarBtn.click({ force: true });
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);

    logger.info("LOGIN-ONLY", `After search URL: ${page.url()}`);
    const resultText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    logger.info("LOGIN-ONLY", `SEARCH RESULT TEXT:\n${resultText.slice(0, 3000)}`);
    const resultHtml = await page.evaluate(() => document.documentElement.outerHTML).catch(() => "");
    logger.info("LOGIN-ONLY", `SEARCH RESULT HTML (first 3000):\n${resultHtml.slice(0, 3000)}`);

    // PAUSE FOREVER — do NOT close the browser
    logger.info("LOGIN-ONLY", "✅ COMPLETE — browser left OPEN for inspection. Press Ctrl+C to exit.");
    await new Promise<void>((resolve) => {
      const keepAlive = () => {
        if (browser.isConnected()) setTimeout(keepAlive, 5000);
        else resolve();
      };
      keepAlive();
    });
  } catch (err) {
    logger.error("LOGIN-ONLY", "Error during login test", {
      error: err instanceof Error ? err.message : String(err),
    });
    logger.info("LOGIN-ONLY", "Browser left OPEN for manual inspection. Press Ctrl+C to exit.");
    await new Promise(() => {});
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});