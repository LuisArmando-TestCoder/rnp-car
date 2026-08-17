import { Page } from "playwright";
import { RnpVehicleData } from "./types";
import { logger } from "./logger";

/**
 * Extracts vehicle data from the RNP "Consulta de Vehículo" result page.
 * The page uses a label/value table layout (e.g. "Marca:\tMITSUBISHI").
 * We parse the raw visible text with regex since the JSF table structure
 * is complex and the field labels are stable.
 */
export async function extractVehicleData(page: Page): Promise<RnpVehicleData> {
  logger.info("PARSE", "Extracting vehicle data from result page");

  const rawText = await page.evaluate(() => document.body.innerText);

  // Helper: find a value after "Label:" (case-insensitive, handles tabs/spaces)
  const field = (label: string): string => {
    const re = new RegExp(`${label}\\s*[:\\t]\\s*([^\\n\\t]+)`, "i");
    const m = rawText.match(re);
    return m ? m[1].trim() : "";
  };

  // Plate: "El Vehículo Placa: CL 330873"
  const plateMatch = rawText.match(/Placa:\s*([^\n]+)/i);
  const plate = plateMatch ? plateMatch[1].trim() : "";

  // Registration citation: "Tomo: 2022  Asiento: 00113712  Secuencia: 001  Fecha: 15-feb-2022"
  const tomo = field("Tomo");
  const asiento = field("Asiento");
  const secuencia = field("Secuencia");
  const fecha = field("Fecha");

  // General characteristics
  const general = {
    marca: field("Marca"),
    estilo: field("Estilo"),
    categoria: field("Categoría") || field("Categoria"),
    capacidad: field("Capacidad"),
    serie: field("# de Serie") || field("Serie"),
    pesoVacio: field("Peso Vacio") || field("Peso Vacío"),
    carroceria: field("Carroceria") || field("Carrocería"),
    pesoNeto: field("Peso Neto"),
    traccion: field("Tracción") || field("Traccion"),
    transmision: field("Transmisión") || field("Transmision"),
    pbvFabricante: field("PBV (Fabricante)"),
    chasis: field("# de Chasis") || field("Chasis"),
    valorHacienda: field("Valor Hacienda"),
    anioFabricacion: field("Año Fabricación") || field("Ano Fabricacion"),
    estadoActual: field("Estado Actual"),
    longitud: field("Longitud"),
    estadoTributario: field("Estado Tributario"),
    cabina: field("Cabina"),
    claseTributaria: field("Clase Tributaria"),
    techo: field("Techo"),
    uso: field("Uso"),
    pesoRemolque: field("Peso Remolque"),
    valorContrato: field("Valor Contrato"),
    color: field("Color"),
    numeroRegistral: field("Numero registral") || field("Número registral"),
    convertido: field("Convertido"),
    moneda: field("Moneda"),
    vin: field("# de VIN") || field("VIN"),
  };

  // Engine characteristics
  const engine = {
    numeroMotor: field("N.Motor") || field("N. Motor"),
    marca: field("Marca"),
    serie: field("# de Serie") || field("Serie"),
    modelo: field("Modelo"),
    cilindrada: field("Cilindrada"),
    cilindros: field("Cilindros"),
    potencia: field("Potencia"),
    combustible: field("Combustible"),
    fabricante: field("Fabricante"),
    procedencia: field("Procedencia"),
  };

  // Owners table: "Detalle | Tipo Identificación | Número Identificación | Nombre"
  const owners: RnpVehicleData["owners"] = [];
  const ownerRows = rawText.match(
    /Ver Persona\s+([^\n]+)\s+([^\n]+)\s+([^\n]+)/g
  );
  if (ownerRows) {
    for (const row of ownerRows) {
      const parts = row.split(/\s+/).filter(Boolean);
      // parts: ["Ver","Persona", tipoId, numId, ...nombre]
      if (parts.length >= 4) {
        owners.push({
          detalle: "Ver Persona",
          tipoIdentificacion: parts[2],
          numeroIdentificacion: parts[3],
          nombre: parts.slice(4).join(" "),
        });
      }
    }
  }

  // Flags
  const flags = {
    gravamenes: /No Posee Gravamen/.test(rawText) ? false : /Gravamen/.test(rawText),
    anotaciones: /No Posee Anotaci/.test(rawText) ? false : /Anotaci/.test(rawText),
    infracciones: /No Posee Infracci/.test(rawText) ? false : /Infracci/.test(rawText),
    levantamientos: /No Posee Levantamiento/.test(rawText) ? false : /Levantamiento/.test(rawText),
  };

  logger.info("PARSE", `Extracted vehicle: plate=${plate}, marca=${general.marca}, owners=${owners.length}`);

  return {
    plate,
    registration: { tomo, asiento, secuencia, fecha },
    general,
    engine,
    owners,
    flags,
    rawText,
    scrapedAt: new Date().toISOString(),
  };
}