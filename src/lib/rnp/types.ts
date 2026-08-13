export interface RnpCredentials {
  user: string;
  pass: string;
}

export interface RnpSearchParams {
  /** Province code 1-7 (defaults to "1") */
  province?: string;
  /** Finca number (digits only) */
  finca: string;
  /** Condominium flag "F" */
  condo?: string;
  /** Derecho / extension (defaults to "000") */
  extension?: string;
}

export interface RnpOwner {
  name: string;
  type: "Person" | "Company";
  idNumber: string;
  maritalStatus: string;
  ownershipType: "Full" | "Usufruct" | "Naked Property" | "Partial";
  hasGravamen: boolean;
  hasAnotacion: boolean;
}

export interface RnpGravamenDetail {
  citas: string;
  description: string;
}

export interface RnpPropertyData {
  fincaNumber: string;
  nature: string;
  location: string;
  size: string;
  plan?: string;
  fiscalValue?: string;
  linderos?: string;
  antecedentes?: string;
  owners: RnpOwner[];
  gravamenDetails: Record<string, RnpGravamenDetail[]>;
  rawText: string;
  scrapedAt: string;
}

export interface RnpScrapeResult {
  status: "success" | "not_found" | "error";
  data?: RnpPropertyData;
  error?: string;
  logs: string[];
}

export interface RnpScrapeOptions {
  credentials?: RnpCredentials;
  /** Province code 1-7 (defaults to "1") */
  province?: string;
  headless?: boolean;
  takeCharge?: boolean;
  timeoutMs?: number;
  onLog?: (message: string) => void;
}

// ─── Vehicle consultation ────────────────────────────────────────────────

export interface RnpVehicleData {
  /** License plate, e.g. "CL 330873" */
  plate: string;
  /** Registration citation (Tomo/Asiento/Secuencia/Fecha) */
  registration: {
    tomo: string;
    asiento: string;
    secuencia: string;
    fecha: string;
  };
  /** General characteristics */
  general: {
    marca: string;
    estilo: string;
    categoria: string;
    capacidad: string;
    serie: string;
    pesoVacio: string;
    carroceria: string;
    pesoNeto: string;
    traccion: string;
    pbvFabricante: string;
    chasis: string;
    valorHacienda: string;
    anioFabricacion: string;
    estadoActual: string;
    longitud: string;
    estadoTributario: string;
    cabina: string;
    claseTributaria: string;
    techo: string;
    uso: string;
    pesoRemolque: string;
    valorContrato: string;
    color: string;
    numeroRegistral: string;
    convertido: string;
    moneda: string;
    vin: string;
  };
  /** Engine characteristics */
  engine: {
    numeroMotor: string;
    marca: string;
    serie: string;
    modelo: string;
    cilindrada: string;
    cilindros: string;
    potencia: string;
    combustible: string;
    fabricante: string;
    procedencia: string;
  };
  /** Owners */
  owners: {
    detalle: string;
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    nombre: string;
  }[];
  /** Flags */
  flags: {
    gravamenes: boolean;
    anotaciones: boolean;
    infracciones: boolean;
    levantamientos: boolean;
  };
  rawText: string;
  scrapedAt: string;
}

export interface RnpVehicleScrapeResult {
  status: "success" | "not_found" | "error";
  data?: RnpVehicleData;
  error?: string;
  logs: string[];
}

export type RnpConsultationType = "vehiculo" | "polizas";
export type RnpVehicleSearchMode = "vin" | "placa" | "nombre";

export interface RnpVehicleSelections {
  /** Top-level consultation type */
  consultationType?: RnpConsultationType;
  /** Vehicle search mode (VIN / plate / name) */
  searchMode?: RnpVehicleSearchMode;
  /** Search type shown in the form dropdown (e.g. "Número de VIN") */
  searchType?: string;
  /** Document type (e.g. "Certificado") */
  documentType?: string;
  /** Vehicle type (e.g. "Automóvil") */
  vehicleType?: string;
  /** Clase de código (e.g. "CL") - required when multiple results appear */
  codeClass?: string;
  /** Plate number (when searchMode = "placa") */
  plate?: string;
  /** Owner name (when searchMode = "nombre") */
  name?: string;
}

/** Options extracted from the RNP consultation form HTML */
export interface RnpFormOptions {
  /** Options for the "clase de código" dropdown */
  codeClasses: string[];
  /** Options for the search type dropdown */
  searchTypes: string[];
  /** Options for the document type dropdown */
  documentTypes: string[];
  /** Options for the vehicle type dropdown */
  vehicleTypes: string[];
  /** Whether the form was reachable (false if WAF blocked) */
  reachable: boolean;
  /** Error message if the form was not reachable */
  error?: string;
}

export interface RnpVehicleScrapeOptions {
  credentials?: RnpCredentials;
  headless?: boolean;
  timeoutMs?: number;
  onLog?: (message: string) => void;
  selections?: RnpVehicleSelections;
  /** Abort signal to cancel the scrape early (e.g. client disconnect) */
  signal?: AbortSignal;
}
