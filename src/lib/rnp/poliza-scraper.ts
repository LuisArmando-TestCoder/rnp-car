import { RnpPolizaScrapeOptions, RnpPolizaScrapeResult } from "./types";
import { performSecureLogin, safeLogout } from "./auth";
import { extractPolizaDataWithLLM } from "./poliza-llm-parser";
import { getFirstCredential } from "./credentials";
import { logger, setLogStream } from "./logger";

const RNP_LOGIN_URL = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const POLIZA_URL =
  "https://www.rnpdigital.com/shopping/consultaDocumentos/bienesMuebles/paramConsultaPoliza.jspx";

/**
 * Scrapes póliza data from RNP Digital.
 * Logs in, navigates to the póliza consultation form, selects the search type
 * (e.g. "Número de VIN"), fills the search value, submits, clicks "Ver póliza"
 * on the listado page, and extracts the póliza detail report.
 */
export async function scrapePolizaData(
  searchValue: string,
  options: RnpPolizaScrapeOptions = {}
): Promise<RnpPolizaScrapeResult> {
  const logs: string[] = [];
  const { credentials, headless = true, timeoutMs = 60000, onLog, selections, signal } = options;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Scrape cancelled", "AbortError");
  };
  const searchTypeLabel = selections?.searchType || "Número de VIN";

  const logHandler = (entry: { level: string; scope: string; message: string; timestamp: string }) => {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
    logs.push(line);
    onLog?.(line);
  };
  setLogStream(logHandler);

  const envCredential = getFirstCredential();
  const rnpUser = credentials?.user || envCredential?.user;
  const rnpPass = credentials?.pass || envCredential?.pass;

  logger.info("SCRAPER", `Starting póliza scrape for ${searchTypeLabel}: ${searchValue}`, {
    headless,
    hasCredentials: Boolean(rnpUser && rnpPass),
  });

  let browser: import("playwright").Browser | null = null;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // STAGE 1: Login
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 1 - Loading RNP Digital login page...");
    await page.goto(RNP_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    throwIfAborted();

    if (rnpUser && rnpPass) {
      logger.info("SCRAPER", "STAGE 2 - Performing secure login...");
      let loggedIn = await performSecureLogin(page, rnpUser, rnpPass);
      if (!loggedIn) {
        logger.warn("SCRAPER", "Login failed, clearing state and retrying once...");
        await context.clearCookies();
        await page.goto(RNP_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        loggedIn = await performSecureLogin(page, rnpUser, rnpPass);
      }
      if (!loggedIn) throw new Error("Failed to transition past login page.");
    }

    // STAGE 3: Navigate to póliza consultation form
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 3 - Navigating to póliza consultation form...");
    await page.goto(POLIZA_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(2500);
    throwIfAborted();

    // Check for WAF block
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/rejected|support id/i.test(bodyText)) {
      logger.error("SCRAPER", "WAF blocked the póliza form request.");
      return { status: "error", error: "WAF blocked the request", logs };
    }

    // STAGE 4: Select the search type (e.g. "Número de VIN")
    logger.info("SCRAPER", `STAGE 4 - Selecting search type: ${searchTypeLabel}`);
    const typeSelect = page.locator("select").first();
    const opts = await typeSelect.locator("option").allTextContents();
    const idx = opts.findIndex((t) => t.trim().toLowerCase().includes(searchTypeLabel.toLowerCase()));
    if (idx >= 0) {
      logger.info("SCRAPER", `Select 0 -> ${opts[idx].trim()}`);
      await typeSelect.selectOption({ index: idx });
    } else {
      logger.warn("SCRAPER", `Search type not found: ${searchTypeLabel} (options: ${JSON.stringify(opts)})`);
    }
    // Wait for the AJAX re-render that swaps the input fields
    await page.waitForTimeout(1500);
    throwIfAborted();

    // STAGE 5: Fill the search value
    logger.info("SCRAPER", `STAGE 5 - Filling ${searchTypeLabel}: ${searchValue}`);
    const searchInput = page.locator("input[type='text']").last();
    await searchInput.fill("");
    await searchInput.fill(searchValue);
    await page.waitForTimeout(600);

    // STAGE 6: Submit - try multiple selectors for the Consultar button
    logger.info("SCRAPER", "STAGE 6 - Clicking 'Consultar'...");
    const submitSelectors = [
      "img[src*='btn-consultar' i]",
      "img[alt='Consultar' i]",
      "input[type='image'][src*='consultar' i]",
      "input[type='image'][alt*='onsultar' i]",
      "a > img[src*='onsultar' i]",
      "button:has-text('Consultar')",
      "input[type='submit']",
    ];

    let clicked = false;
    for (const sel of submitSelectors) {
      const el = page.locator(sel).first();
      if ((await el.count().catch(() => 0)) > 0) {
        logger.debug("SCRAPER", `Clicking submit via: ${sel}`);
        await el.click({ force: true }).catch(() => {});
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      logger.debug("SCRAPER", "No submit button found, clicking first form image");
      await page.locator("form img").first().click({ force: true }).catch(() => {});
    }

    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(5000);
    throwIfAborted();

    // Diagnostic: log the current page state
    const currentUrl = page.url();
    const bodyAfterSubmit = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    logger.info("SCRAPER", `Post-submit URL: ${currentUrl}`);
    logger.info(
      "SCRAPER",
      `Post-submit page text (first 500 chars): ${bodyAfterSubmit.slice(0, 500).replace(/\n/g, " | ")}`
    );

    // Check for "not found" message
    if (/no se encontr|no se encuentra|no existen|no existe/i.test(bodyAfterSubmit)) {
      logger.warn("SCRAPER", "Póliza not found in National Registry.");
      return { status: "not_found", error: "Póliza not found", logs };
    }

    // If we're still on the form page, the search failed
    if (currentUrl.includes("paramConsultaPoliza")) {
      logger.warn("SCRAPER", "Search did not navigate to results page - póliza not found.");
      return { status: "not_found", error: "Póliza not found", logs };
    }

    // STAGE 6b: If we're on the listado page, click "Ver póliza"
    if (currentUrl.includes("RespPolizaListado")) {
      logger.info("SCRAPER", "STAGE 6b - On listado page, clicking 'Ver póliza'...");
      const verPolizaSelectors = [
        "a:has-text('Ver póliza')",
        "a:has-text('Ver poliza')",
        "a[onclick*='polizaLink' i]",
      ];
      let verClicked = false;
      for (const sel of verPolizaSelectors) {
        const el = page.locator(sel).first();
        if ((await el.count().catch(() => 0)) > 0) {
          logger.debug("SCRAPER", `Clicking 'Ver póliza' via: ${sel}`);
          await el.click({ force: true }).catch(() => {});
          verClicked = true;
          break;
        }
      }
      if (!verClicked) {
        logger.warn("SCRAPER", "No 'Ver póliza' link found on listado page.");
        return { status: "not_found", error: "No póliza detail link found", logs };
      }
      await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
      await page.waitForTimeout(4000);
      throwIfAborted();
    }

    // STAGE 6c: Capture the RNP detail page as a PDF
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 6c - Capturing RNP póliza detail page as PDF...");
    let resultPdfBase64: string | undefined;
    try {
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      });
      resultPdfBase64 = pdfBuffer.toString("base64");
      logger.info("SCRAPER", `Captured RNP póliza PDF (${Math.round(pdfBuffer.length / 1024)} KB)`);
    } catch (e) {
      logger.warn("SCRAPER", "Failed to capture RNP póliza PDF (non-critical)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // STAGE 7: Extract póliza data
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 7 - Extracting póliza data...");
    const data = await extractPolizaDataWithLLM(page);
    logger.info(
      "SCRAPER",
      `Extracted póliza: aduana=${data.aduana}, poliza=${data.numeroPoliza}, marca=${data.vehiculo?.marca}`
    );

    return { status: "success", data: { ...data, resultPdfBase64 }, logs };
  } catch (error) {
    logger.error("SCRAPER", "Error during póliza scraping pipeline", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
  } finally {
    if (browser) {
      try {
        logger.info("SCRAPER", "Performing clean exit (safe logout)...");
        const contexts = browser.contexts();
        if (contexts.length > 0) {
          const pages = contexts[0].pages();
          if (pages.length > 0) {
            await safeLogout(pages[0]);
          }
        }
        await browser.close();
      } catch (e) {
        logger.warn("SCRAPER", "Clean exit failed (non-critical)", { error: String(e) });
        await browser.close().catch(() => {});
      }
    }
    setLogStream(null);
  }
}
