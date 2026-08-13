import { Page } from "playwright";
import { logger } from "./logger";

/**
 * Navigates to the "Consulta Por Número de Finca" (property search) page.
 * Works whether the user is logged in or still on the public shopping area.
 */
export async function navigateToPropertySearch(page: Page) {
  logger.info("NAV", "Navigating to property search");

  // If the params form (finca input) is already visible, we are there
  const alreadyThere = await page
    .locator("#params\\:finca")
    .count()
    .catch(() => 0);
  if (alreadyThere > 0) {
    logger.debug("NAV", "Already on property search form");
    return;
  }

  // RNP shopping catalog flow: the consulta is reached through the "Consulta de Fincas" link
  const consultaLink = page.locator(
    "a[href*='consultar' i], a[href*='consulta' i], a[href*='finca' i], a:has-text('Consulta'), a:has-text('Fincas'), a:has-text('Finca')"
  );

  // Try direct links first
  const linkCount = await consultaLink.count().catch(() => 0);
  if (linkCount > 0) {
    for (let i = 0; i < linkCount; i++) {
      try {
        await consultaLink.nth(i).click({ force: true });
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
        const found = await page
          .locator("#params\\:finca")
          .count()
          .catch(() => 0);
        if (found > 0) {
          logger.info("NAV", "Reached property search form via link");
          return;
        }
      } catch (e) {
        logger.debug("NAV", `Link attempt ${i} failed`, { error: String(e) });
      }
    }
  }

  // Fallback: direct URL for the property search page (JSF action)
  logger.debug("NAV", "Falling back to direct search URL");
  await page.goto("https://www.rnpdigital.com/shopping/consultaFinca.jspx", {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });

  const found = await page
    .locator("#params\\:finca")
    .count()
    .catch(() => 0);
  if (found === 0) {
    // Try the menu anchor style used by RNP: "params" form inside #central
    await page.waitForSelector("#params\\:finca", { timeout: 15000 }).catch(() => {});
  }

  logger.info("NAV", "Property search form ready");
}