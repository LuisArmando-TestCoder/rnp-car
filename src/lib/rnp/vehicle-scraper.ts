import { RnpVehicleScrapeOptions, RnpVehicleScrapeResult } from "./types";
import { performSecureLogin, safeLogout } from "./auth";
import { extractVehicleDataWithLLM } from "./vehicle-llm-parser";
import { getFirstCredential } from "./credentials";
import { logger, setLogStream } from "./logger";

const RNP_LOGIN_URL = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const VEHICLE_URL = "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaVehiculo.jspx";

/**
 * Scrapes vehicle data from RNP Digital by VIN.
 * Logs in, navigates to the vehicle consultation form, selects "Número de VIN",
 * fills the VIN, submits, and extracts the vehicle report.
 */
export async function scrapeVehicleData(
  vin: string,
  options: RnpVehicleScrapeOptions = {}
): Promise<RnpVehicleScrapeResult> {
  const logs: string[] = [];
  const { credentials, headless = true, timeoutMs = 60000, onLog, selections, signal } = options;
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException("Scrape cancelled", "AbortError");
  };
  const searchMode = selections?.searchMode || "vin";
  // Only parse a code-class prefix when the user explicitly chose one from the option.
  // Do NOT auto-detect a leading letter prefix: "CLB102" without a chosen class stays as-is.
  const rawPlate = searchMode === "placa" ? selections?.plate || vin : "";
  const codeClass = selections?.codeClass;
  const plateNumber = codeClass
    ? rawPlate.replace(new RegExp(`^${codeClass}\\s*`, "i"), "")
    : rawPlate.trim();
  const searchValue = searchMode === "placa" ? plateNumber : searchMode === "nombre" ? selections?.name || vin : vin;
  const searchTypeLabel = searchMode === "placa" ? "Número de Placa" : searchMode === "nombre" ? "Nombre" : "Número de VIN";

  const logHandler = (entry: { level: string; scope: string; message: string; timestamp: string }) => {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.scope}] ${entry.message}`;
    logs.push(line);
    onLog?.(line);
  };
  setLogStream(logHandler);

  const envCredential = getFirstCredential();
  const rnpUser = credentials?.user || envCredential?.user;
  const rnpPass = credentials?.pass || envCredential?.pass;

  logger.info("SCRAPER", `Starting vehicle scrape for VIN: ${vin}`, {
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

    // STAGE 3: Navigate to vehicle consultation form
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 3 - Navigating to vehicle consultation form...");
    await page.goto(VEHICLE_URL, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(2500);
    throwIfAborted();

    // STAGE 4: Apply pre-selected form options (search type, document type, vehicle type)
    logger.info("SCRAPER", "STAGE 4 - Applying form selections...");
    const selects = page.locator("select");
    const selectCount = await selects.count();
    logger.debug("SCRAPER", `Found ${selectCount} select dropdowns`);

    const selectionMap: Array<{ key: keyof NonNullable<typeof selections>; label: string }> = [
      { key: "searchType", label: searchTypeLabel },
      { key: "documentType", label: "" },
      { key: "vehicleType", label: "" },
    ];

    for (let i = 0; i < selectCount && i < selectionMap.length; i++) {
      const sel = page.locator("select").nth(i);
      const opts = await sel.locator("option").allTextContents();
      const desired = selections?.[selectionMap[i].key] || selectionMap[i].label;
      if (!desired) continue;
      const idx = opts.findIndex((t) => t.trim().toLowerCase().includes(desired.toLowerCase()));
      if (idx >= 0) {
        logger.info("SCRAPER", `Select ${i} -> ${desired}`);
        await sel.selectOption({ index: idx });
      } else {
        logger.warn("SCRAPER", `Select ${i} option not found: ${desired} (options: ${JSON.stringify(opts)})`);
      }
      await page.waitForTimeout(400);
    }

    // STAGE 5: Fill the search value (VIN, plate, or name)
    logger.info("SCRAPER", `STAGE 5 - Filling ${searchTypeLabel}: ${searchValue}`);
    const searchInput = page.locator("input[type='text']").last();
    await searchInput.fill("");
    await searchInput.fill(searchValue);
    await page.waitForTimeout(600);

    // STAGE 5b: Apply the "clase de código" when present.
    // The class is a select with id="class" (e.g. value="CL" for "CL-CARGA LIVIANA").
    // Selecting it triggers an AJAX call that populates the dependent "Código" select.
    if (codeClass) {
      logger.info("SCRAPER", `STAGE 5b - Applying clase de código: ${codeClass}`);
      const classSelect = page.locator("select#class");
      if ((await classSelect.count()) > 0) {
        const byValue = await classSelect.locator(`option[value="${codeClass}"]`).count().catch(() => 0);
        if (byValue > 0) {
          logger.info("SCRAPER", `Select #class -> value ${codeClass}`);
          await classSelect.selectOption({ value: codeClass });
        } else {
          const opts = await classSelect.locator("option").allTextContents();
          const idx = opts.findIndex(
            (t) =>
              t.trim().toLowerCase() === codeClass.toLowerCase() ||
              t.trim().toLowerCase().startsWith(codeClass.toLowerCase() + "-")
          );
          if (idx >= 0) {
            logger.info("SCRAPER", `Select #class -> index ${idx} (${opts[idx].trim()})`);
            await classSelect.selectOption({ index: idx });
          } else {
            logger.warn("SCRAPER", `Clase de código ${codeClass} not found in #class select`);
          }
        }
        // Wait for the AJAX to populate the dependent "Código" select
        await page.waitForTimeout(800);
      } else {
        // Fallback: scan all selects for an option matching the code class
        let applied = false;
        const allSelects = page.locator("select");
        const sc = await allSelects.count();
        for (let i = 0; i < sc; i++) {
          const opts = await allSelects.nth(i).locator("option").allTextContents();
          const idx = opts.findIndex(
            (t) =>
              t.trim().toLowerCase() === codeClass.toLowerCase() ||
              t.trim().toLowerCase().startsWith(codeClass.toLowerCase() + "-")
          );
          if (idx >= 0) {
            logger.info("SCRAPER", `Select ${i} -> clase de código ${codeClass}`);
            await allSelects.nth(i).selectOption({ index: idx });
            applied = true;
            break;
          }
        }
        if (!applied) {
          logger.warn("SCRAPER", `Clase de código ${codeClass} not found in any select`);
        }
        await page.waitForTimeout(800);
      }
    }

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
      // Fallback: click the first image inside the form
      logger.debug("SCRAPER", "No submit button found, clicking first form image");
      await page.locator("form img").first().click({ force: true }).catch(() => {});
    }

    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
    await page.waitForTimeout(5000);

    // Diagnostic: log the current page state
    const currentUrl = page.url();
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    logger.info("SCRAPER", `Post-submit URL: ${currentUrl}`);
    logger.info("SCRAPER", `Post-submit page text (first 500 chars): ${bodyText.slice(0, 500).replace(/\n/g, " | ")}`);

    // Check for "not found" message
    if (/no se encontr|no se encuentra|no existen|no existe/i.test(bodyText)) {
      logger.warn("SCRAPER", "Vehicle not found in National Registry.");
      return { status: "not_found", error: "Vehicle not found", logs };
    }

    // If we're still on the form page (not the results page), the search failed
    if (currentUrl.includes("paramConsultaVehiculo")) {
      logger.warn("SCRAPER", "Search did not navigate to results page - vehicle not found.");
      return { status: "not_found", error: "Vehicle not found", logs };
    }

    // STAGE 7: Extract vehicle data
    throwIfAborted();
    logger.info("SCRAPER", "STAGE 7 - Extracting vehicle data...");
    const data = await extractVehicleDataWithLLM(page);
    logger.info("SCRAPER", `Extracted vehicle: plate=${data.plate}, marca=${data.general.marca}`);

    return { status: "success", data, logs };
  } catch (error) {
    logger.error("SCRAPER", "Error during vehicle scraping pipeline", {
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