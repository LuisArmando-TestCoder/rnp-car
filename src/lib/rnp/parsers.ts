import { Page } from "playwright";
import { RnpOwner, RnpGravamenDetail, RnpPropertyData } from "./types";
import { logger } from "./logger";

/**
 * Extracts the main property data from the RNP results page.
 * The results table contains the property header plus one row per owner.
 */
export async function extractPropertyData(page: Page): Promise<RnpPropertyData> {
  logger.info("PARSE", "Extracting property data from results page");

  // Grab the full visible text for legacy/AI fallback
  const rawText = await page.evaluate(() => document.body.innerText);

  // Property header fields (JSF table layout)
  const getField = async (label: string): Promise<string> => {
    try {
      const cell = page.locator(`td:has-text("${label}")`).first();
      if ((await cell.count()) === 0) return "";
      // The value is usually in the next sibling cell
      const value = await cell.locator("xpath=following-sibling::td[1]").first().innerText().catch(() => "");
      return value.trim();
    } catch {
      return "";
    }
  };

  const fincaNumber = (await getField("NÚMERO DE FINCA")) || (await getField("NUMERO DE FINCA")) || "";
  const nature = (await getField("NATURALEZA")) || "";
  const location = (await getField("UBICACIÓN")) || (await getField("UBICACION")) || "";
  const size = (await getField("ÁREA")) || (await getField("AREA")) || "";
  const plan = (await getField("PLANO")) || undefined;
  const fiscalValue = (await getField("VALOR FISCAL")) || undefined;
  const linderos = (await getField("LINDEROS")) || undefined;
  const antecedentes = (await getField("ANTECEDENTES")) || undefined;

  // Owners table: #listadoDerechosForm:misDerechos contains the rows
  const owners: RnpOwner[] = [];
  const ownerRows = page.locator("#listadoDerechosForm\\:misDerechos tr, #listadoDerechosForm tr, table tr");

  const rowCount = await ownerRows.count().catch(() => 0);
  for (let i = 0; i < rowCount; i++) {
    const row = ownerRows.nth(i);
    const rowText = (await row.innerText().catch(() => "")).trim();
    if (!rowText || rowText.length < 3) continue;

    // Skip header rows
    if (/^(NOMBRE|NOMBRE DEL|CEDULA|CÉDULA|ESTADO|DERECHO|GRAV|ANOT|TIPO)/i.test(rowText)) continue;

    const cells = row.locator("td");
    const cellCount = await cells.count().catch(() => 0);
    if (cellCount < 2) continue;

    const name = (await cells.nth(0).innerText().catch(() => "")).trim();
    if (!name) continue;

    const idNumber = cellCount > 1 ? (await cells.nth(1).innerText().catch(() => "")).trim() : "";
    const maritalStatus = cellCount > 2 ? (await cells.nth(2).innerText().catch(() => "")).trim() : "";
    const ownershipTypeRaw = cellCount > 3 ? (await cells.nth(3).innerText().catch(() => "")).trim() : "";

    // Determine flags from the row text (GRAVAMEN / ANOTACION columns)
    const upper = rowText.toUpperCase();
    const hasGravamen = upper.includes("GRAVAMEN") || upper.includes("HIPOTECA") || upper.includes("EMBARGO");
    const hasAnotacion = upper.includes("ANOTACION") || upper.includes("ANOTACIÓN") || upper.includes("DEMANDA");

    const type: RnpOwner["type"] = /S\.?A\.?|S\.?R\.?L\.?|LTDA|LIMITADA|SOCIEDAD|CORP|INC/i.test(name)
      ? "Company"
      : "Person";

    let ownershipType: RnpOwner["ownershipType"] = "Full";
    if (/USUFRUCTO|USUFRUCT/i.test(ownershipTypeRaw)) ownershipType = "Usufruct";
    else if (/NUDA|NUDO/i.test(ownershipTypeRaw)) ownershipType = "Naked Property";
    else if (/PARCIAL|PROINDIVISO|CUOTA/i.test(ownershipTypeRaw)) ownershipType = "Partial";

    owners.push({
      name,
      type,
      idNumber,
      maritalStatus,
      ownershipType,
      hasGravamen,
      hasAnotacion,
    });
  }

  logger.info("PARSE", `Extracted ${owners.length} owners`);

  return {
    fincaNumber,
    nature,
    location,
    size,
    plan,
    fiscalValue,
    linderos,
    antecedentes,
    owners,
    gravamenDetails: {},
    rawText,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Extracts the deep gravamen (encumbrance) details from the owner detail page.
 * The detail page contains "CITAS:" rows with the official document references.
 */
export async function extractDeepGravamenDetails(page: Page): Promise<RnpGravamenDetail[]> {
  logger.info("PARSE", "Extracting deep gravamen details");

  const details: RnpGravamenDetail[] = [];

  // Wait for the CITAS marker that identifies the detail page
  await page.waitForSelector("td:has-text('CITAS:')", { timeout: 10000 }).catch(() => {});

  // Each gravamen block is typically a table row containing CITAS + description
  const rows = page.locator("tr:has(td:has-text('CITAS:'))");
  const count = await rows.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const text = (await row.innerText().catch(() => "")).trim();
    if (!text) continue;

    const citasMatch = text.match(/CITAS:\s*([^\n]+)/i);
    const citas = citasMatch ? citasMatch[1].trim() : "";

    // Description is the remaining text after CITAS
    const description = text.replace(/CITAS:\s*[^\n]*/i, "").trim();

    if (citas || description) {
      details.push({ citas, description });
    }
  }

  // Fallback: if no structured rows, capture all text containing CITAS
  if (details.length === 0) {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const blocks = bodyText.split(/\n\s*\n/);
    for (const block of blocks) {
      if (block.includes("CITAS:")) {
        const citasMatch = block.match(/CITAS:\s*([^\n]+)/i);
        details.push({
          citas: citasMatch ? citasMatch[1].trim() : "",
          description: block.replace(/CITAS:\s*[^\n]*/i, "").trim(),
        });
      }
    }
  }

  logger.info("PARSE", `Extracted ${details.length} gravamen details`);
  return details;
}