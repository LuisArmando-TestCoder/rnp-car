import { Page } from "playwright";
import { RnpVehicleData } from "./types";
import { callOpenRouter } from "../openRouter";
import { logger } from "./logger";

const SYSTEM_PROMPT = `You are a data extraction engine for the Costa Rica National Registry (RNP Digital) vehicle consultation pages.

Extract ALL vehicle data from the provided HTML/innerText and return it as a SINGLE valid JSON object (no markdown, no code fences, no commentary) matching this exact TypeScript shape:

{
  "plate": "string — license plate e.g. 'CL 330873'",
  "registration": {
    "tomo": "string",
    "asiento": "string",
    "secuencia": "string",
    "fecha": "string"
  },
  "general": {
    "marca": "string",
    "estilo": "string",
    "categoria": "string",
    "capacidad": "string",
    "serie": "string",
    "pesoVacio": "string",
    "carroceria": "string",
    "pesoNeto": "string",
    "traccion": "string",
    "pbvFabricante": "string",
    "chasis": "string",
    "valorHacienda": "string",
    "anioFabricacion": "string",
    "estadoActual": "string",
    "longitud": "string",
    "estadoTributario": "string",
    "cabina": "string",
    "claseTributaria": "string",
    "techo": "string",
    "uso": "string",
    "pesoRemolque": "string",
    "valorContrato": "string",
    "color": "string",
    "numeroRegistral": "string",
    "convertido": "string",
    "moneda": "string",
    "vin": "string"
  },
  "engine": {
    "numeroMotor": "string",
    "marca": "string",
    "serie": "string",
    "modelo": "string",
    "cilindrada": "string",
    "cilindros": "string",
    "potencia": "string",
    "combustible": "string",
    "fabricante": "string",
    "procedencia": "string"
  },
  "owners": [
    {
      "detalle": "string",
      "tipoIdentificacion": "string",
      "numeroIdentificacion": "string",
      "nombre": "string"
    }
  ],
  "flags": {
    "gravamenes": "boolean — true if the vehicle HAS gravamenes, false if 'No Posee Gravamen'",
    "anotaciones": "boolean — true if the vehicle HAS anotaciones, false if 'No Posee Anotación'",
    "infracciones": "boolean — true if the vehicle HAS infracciones, false if 'No Posee Infracción'",
    "levantamientos": "boolean — true if the vehicle HAS levantamientos, false if 'No Posee Levantamiento'"
  }
}

Rules:
- Use empty string "" for any field not present in the source.
- Preserve exact values (numbers, dates, currency) as they appear.
- The "owners" array should contain one entry per owner found (look for 'Ver Persona' rows).
- If the page is NOT a vehicle result page (e.g. it's a search form or an error), return {"error": "not a vehicle result page"}.`;

/**
 * Extracts vehicle data from the RNP result page using an LLM (OpenRouter).
 * Sends the page's innerText + a snippet of HTML to the model and parses
 * the returned JSON into a structured RnpVehicleData object.
 */
export async function extractVehicleDataWithLLM(page: Page): Promise<RnpVehicleData> {
  logger.info("PARSE", "Extracting vehicle data via LLM (OpenRouter)");

  const innerText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  const htmlSnippet = await page
    .evaluate(() => document.documentElement?.outerHTML?.slice(0, 20000) || "")
    .catch(() => "");

  const prompt = `Extract the vehicle data from the following RNP Digital page.

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

  const data = parsed as RnpVehicleData;
  data.rawText = innerText;
  data.scrapedAt = new Date().toISOString();

  logger.info("PARSE", `LLM extracted vehicle: plate=${data.plate}, marca=${data.general?.marca}, owners=${data.owners?.length ?? 0}`);
  return data;
}