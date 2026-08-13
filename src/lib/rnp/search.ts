import { Page } from "playwright";
import { RnpSearchParams } from "./types";
import { logger } from "./logger";

/**
 * Parses a raw finca string like "1-23456-000" or "23456" into province/finca/extension.
 */
export function parseFinca(rawFinca: string, selectedProvince?: string): RnpSearchParams {
  const cleanFinca = rawFinca.trim().toUpperCase();
  const hasF = cleanFinca.includes("F");
  const parts = cleanFinca.split("-").filter((p) => p !== "F" && p !== "");

  let province = selectedProvince || "1";
  let finca = "";
  let extension = "000";

  const firstPartIsProvince = parts[0]?.length === 1 && "1234567".includes(parts[0]);

  if (firstPartIsProvince) {
    province = parts[0];
    finca = parts[1] || "";
    extension = parts[2] || "000";
  } else {
    finca = parts[0] || "";
    extension = parts[1] || "000";
  }

  finca = finca.replace(/[^\d]/g, "");
  extension = extension.replace(/[^\d]/g, "");

  if (!finca) {
    throw new Error("Could not extract a valid Finca Number.");
  }

  return {
    province,
    finca,
    extension,
    condo: hasF ? "F" : undefined,
  };
}

/**
 * Fills the RNP property search form and submits it.
 * Uses the exact selectors from the "Consulta Por Número de Finca" page.
 */
export async function executePropertySearch(
  page: Page,
  rawFinca: string,
  selectedProvince?: string
): Promise<RnpSearchParams> {
  const params = parseFinca(rawFinca, selectedProvince);
  logger.info("SEARCH", "Executing property search", { ...params });

  await page.waitForSelector("#params\\:finca", { timeout: 15000 });
  await page.waitForTimeout(2000);

  // 1. Province selection
  const provinceSelector = "#params > div > table > tbody > tr:nth-child(1) > td:nth-child(2) > select";
  await page.selectOption(provinceSelector, params.province || "1");
  await page.waitForTimeout(500);

  // 2. Finca number
  await page.fill("#params\\:finca", params.finca);

  // 3. Condo (F) selection
  if (params.condo) {
    logger.debug("SEARCH", "Selecting 'F' for condominium");
    const condoSelector = "#params > div > table > tbody > tr:nth-child(1) > td:nth-child(9) > select";
    await page.selectOption(condoSelector, "F");
  }

  // 4. Submit search (hardware click on image button)
  logger.debug("SEARCH", "Submitting search form");
  await page.waitForTimeout(2000);
  await page.click("#params > div > a > img", { force: true });

  // 5. Wait for results
  logger.debug("SEARCH", "Waiting for result page");
  await page.waitForSelector(".detalle-finca, table, #detalleFinca, #listadoDerechosForm", {
    timeout: 20000,
  });

  return params;
}