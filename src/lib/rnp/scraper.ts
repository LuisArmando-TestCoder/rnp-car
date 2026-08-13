import { RnpScrapeOptions, RnpScrapeResult } from "./types";
import { performSecureLogin, safeLogout } from "./auth";
import { navigateToPropertySearch } from "./navigation";
import { executePropertySearch } from "./search";
import { extractPropertyData, extractDeepGravamenDetails } from "./parsers";
import { getFirstCredential } from "./credentials";
import { logger, setLogStream } from "./logger";

const RNP_LOGIN_URL = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";

/**
 * Main entry point: scrapes the Costa Rica National Registry (RNP Digital)
 * for property data using Playwright. All server-side progress is logged
 * through the structured logger.
 */
export async function scrapePropertyData(
  fincaNumber: string,
  options: RnpScrapeOptions = {}
): Promise<RnpScrapeResult> {
  const logs: string[] = [];
  const {
    credentials,
    province,
    headless = true,
    takeCharge = false,
    timeoutMs = 60000,
    onLog,
  } = options;

  // Forward logs to both internal array and external callback (e.g. NDJSON stream)
  const logHandler = (entry: { level: string; scope: string; message: string; timestamp: string }) => {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
    logs.push(line);
    onLog?.(line);
  };
  setLogStream(logHandler);

  const envCredential = getFirstCredential();
  const rnpUser = credentials?.user || envCredential?.user;
  const rnpPass = credentials?.pass || envCredential?.pass;

  logger.info("SCRAPER", `Starting Playwright scrape for finca: ${fincaNumber}`, {
    headless,
    takeCharge,
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

    // STAGE 1: Load login page
    logger.info("SCRAPER", "STAGE 1 - Loading RNP Digital page...");
    await page.goto(RNP_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // STAGE 2: Login (or manual take-charge mode)
    if (takeCharge) {
      logger.info("SCRAPER", "TAKE CHARGE mode - waiting for manual interaction");
      await page.waitForTimeout(timeoutMs);
      logger.info("SCRAPER", "Take charge session window elapsed");
      return { status: "error", error: "Take charge window expired", logs };
    }

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

    // STAGE 3: Navigate to property search
    logger.info("SCRAPER", "STAGE 3 - Navigating to property search...");
    await navigateToPropertySearch(page);

    // STAGE 4: Execute search
    logger.info("SCRAPER", "STAGE 4 - Executing property search...");
    await executePropertySearch(page, fincaNumber, province);

    // Results stabilization
    logger.info("SCRAPER", "Waiting for registry to stabilize results...");
    await page.waitForTimeout(5000);

    // Check for "No results found" scenario
    const errorMsg = await page.locator(".rich-messages-label").first().innerText().catch(() => "");
    if (errorMsg && /no se encontr|no se encuentra|no existen/i.test(errorMsg)) {
      logger.warn("SCRAPER", "Property not found in National Registry.");
      return { status: "not_found", error: errorMsg.trim(), logs };
    }

    // STAGE 5: Extract main property data
    logger.info("SCRAPER", "STAGE 5 - Extracting property data...");
    const propertyData = await extractPropertyData(page);
    logger.info("SCRAPER", `Found ${propertyData.owners.length} owners.`);

    // STAGE 6: Deep dive into gravamenes for owners with encumbrances
    for (let i = 0; i < propertyData.owners.length; i++) {
      const owner = propertyData.owners[i];
      if (owner.hasGravamen) {
        logger.info("SCRAPER", `Deep dive initiated for ${owner.name}...`);
        try {
          // Re-locate owner links in the central results area
          const ownerLinks = await page.locator("#central a").all();
          if (ownerLinks[i]) {
            await ownerLinks[i].click({ force: true });
          } else {
            await page.click(`//a[contains(text(), '${owner.name}')]`, { force: true });
          }

          await page.waitForSelector("td:has-text('CITAS:')", { timeout: 10000 });

          const details = await extractDeepGravamenDetails(page);
          propertyData.gravamenDetails[owner.name] = details;
          logger.info("SCRAPER", `Found ${details.length} encumbrances for ${owner.name}.`);

          // Go back to the search form (Regresar image)
          await page.click("img[alt='Regresar']", { force: true });
          await page.waitForSelector("#params\\:finca", { timeout: 10000 });

          // If there are more owners to check, re-run the search
          if (i < propertyData.owners.length - 1) {
            logger.info("SCRAPER", `Re-triggering search for next owner (${i + 2})...`);
            await executePropertySearch(page, fincaNumber, province);
            await page.waitForTimeout(5000);
            await page.waitForSelector("#listadoDerechosForm\\:misDerechos", { timeout: 10000 });
          }
        } catch (err) {
          logger.warn("SCRAPER", `Failed deep dive for ${owner.name}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    logger.info("SCRAPER", "Structuring final report...");
    return { status: "success", data: propertyData, logs };
  } catch (error) {
    logger.error("SCRAPER", "Error during scraping pipeline", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      logs,
    };
  } finally {
    if (takeCharge) {
      logger.info("SCRAPER", "Take charge mode - browser left open for manual interaction.");
    } else if (browser) {
      // Clean exit protocol: safe logout & close to prevent account locks
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