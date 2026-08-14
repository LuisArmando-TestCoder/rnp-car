import { Page } from "playwright";
import { RnpPolizaData } from "./types";
import { callOpenRouter } from "../openRouter";
import { logger } from "./logger";

const SYSTEM_PROMPT = `You are a data extraction engine for the Costa Rica National Registry (RNP Digital) póliza consultation detail pages.

Extract ALL póliza data from the provided HTML/innerText and return it as a SINGLE valid JSON object (no markdown, no code fences, no commentary) matching this exact TypeScript shape:

{
  "aduana": "string — e.g. '05 SANTAMARIA'",
  "anioPoliza": "string — e.g. '2022'",
  "numeroPoliza": "string — e.g. '039235'",
  "linea": "string — e.g. '001'",
  "fechaPoliza": "string — e.g. '21-ene-2022'",
  "vehiculo": {
    "marca": "string",
    "modelo": "string",
    "numeroMotor": "string",
    "numeroChasis": "string",
    "estilo": "string",
    "color": "string",
    "cilindrada": "string",
    "cilindros": "string",
    "potencia": "string",
    "longitud": "string",
    "modeloMotor": "string",
    "cambioMotor": "string",
    "pesoNeto": "string",
    "pbvFabricante": "string",
    "pesoRemolque": "string",
    "pesoVacio": "string",
    "categoria": "string",
    "carroceria": "string",
    "techo": "string",
    "marcaMotor": "string",
    "tipo": "string",
    "traccion": "string",
    "cabina": "string",
    "procedencia": "string",
    "capacidad": "string",
    "ejes": "string",
    "refaccion": "string",
    "convertido": "string",
    "serie": "string",
    "vin": "string",
    "combustible": "string",
    "notaExoneracion": "string",
    "leyExoneracion": "string",
    "observaciones": "string",
    "importador": "string",
    "anioFabricacion": "string",
    "identificacionImportador": "string",
    "fechaTica": "string",
    "fechaRTV": "string",
    "horaRTV": "string",
    "fechaINS": "string",
    "horaINS": "string",
    "pago": "string"
  },
  "citas": {
    "tomo": "string",
    "asiento": "string",
    "secuencia": "string"
  },
  "tieneResolucion": "boolean — true if the page shows a resolución, false if it shows 'No Posee Resolución'",
  "resolucion": "string — the resolución text if present, otherwise omit"
}

Rules:
- Use empty string "" for any field not present in the source.
- Preserve exact values (numbers, dates, currency) as they appear.
- The "Aduana: Año: Póliza: Línea: Fecha:" header line contains the póliza identity fields.
- If the page is NOT a póliza detail page (e.g. it's a search form or an error), return {"error": "not a póliza detail page"}.`;

/**
 * Extracts póliza data from the RNP detail page using an LLM (OpenRouter).
 * Sends the page's innerText + a snippet of HTML to the model and parses
 * the returned JSON into a structured RnpPolizaData object.
 */
export async function extractPolizaDataWithLLM(page: Page): Promise<RnpPolizaData> {
  logger.info("PARSE", "Extracting póliza data via LLM (OpenRouter)");

  const innerText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  const htmlSnippet = await page
    .evaluate(() => document.documentElement?.outerHTML?.slice(0, 20000) || "")
    .catch(() => "");

  const prompt = `Extract the póliza data from the following RNP Digital page.

=== INNER TEXT ===
${innerText.slice(0, 12000)}

=== HTML SNIPPET (first 20000 chars) ===
${htmlSnippet}`;

  const raw = await callOpenRouter({
    prompt,
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0.1,
    maxTokens: 4000,
  });

  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    logger.warn("PARSE", "LLM returned invalid JSON, attempting to extract JSON block", {
      error: e instanceof Error ? e.message : String(e),
    });
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM returned no valid JSON");
    parsed = JSON.parse(match[0]);
  }

  if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
    throw new Error(`LLM extraction failed: ${(parsed as { error: string }).error}`);
  }

  const data = parsed as RnpPolizaData;
  data.rawText = innerText;
  data.scrapedAt = new Date().toISOString();

  logger.info(
    "PARSE",
    `LLM extracted póliza: aduana=${data.aduana}, poliza=${data.numeroPoliza}, marca=${data.vehiculo?.marca}`
  );
  return data;
}