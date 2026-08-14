"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.scss";
import type { RnpVehicleData, RnpFormOptions } from "@/lib/rnp";
import { buildVehicleReport } from "@/lib/report";
import { renderReportHtml, buildReportDocx } from "@/lib/report-export";
import Reveal from "@/components/Reveal";

type StreamEvent =
  | { type: "start"; vin: string }
  | { type: "log"; line: string }
  | { type: "result"; status: string; data?: RnpVehicleData; message?: string }
  | { type: "error"; message: string };

type ConsultationType = "vehiculo" | "polizas";
type SearchMode = "vin" | "placa" | "nombre";

export default function Home() {
  const [consultationType, setConsultationType] = useState<ConsultationType>("vehiculo");
  const [searchMode, setSearchMode] = useState<SearchMode>("vin");
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [codeClass, setCodeClass] = useState("");
  const [formOptions, setFormOptions] = useState<RnpFormOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [data, setData] = useState<RnpVehicleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastVehicle, setLastVehicle] = useState<RnpVehicleData | null>(null);
  const [odometer, setOdometer] = useState("");
  const [transmissionType, setTransmissionType] = useState("");
  const [exportPlate, setExportPlate] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Load the RNP form options (clase de código, search types, etc.) on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/vehicle/options");
        const json = (await res.json()) as RnpFormOptions;
        if (!cancelled) {
          setFormOptions(json);
          if (!json.reachable) setOptionsError(json.error || "No se pudo cargar las opciones del formulario");
        }
      } catch (e) {
        if (!cancelled) setOptionsError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reuse previous VIN data: pre-fill plate and vehicle type
  useEffect(() => {
    if (lastVehicle) {
      setPlate(lastVehicle.plate || "");
      if (lastVehicle.general?.categoria) {
        // Keep the vehicle type in sync with the last extracted vehicle
      }
    }
  }, [lastVehicle]);

  const searchValue = searchMode === "vin" ? vin : searchMode === "placa" ? plate : name;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;

    setLoading(true);
    setLogs([]);
    setData(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const selections = {
      consultationType,
      searchMode,
      searchType: searchMode === "placa" ? "Número de Placa" : searchMode === "nombre" ? "Nombre" : "Número de VIN",
      codeClass: codeClass || undefined,
      plate: searchMode === "placa" ? plate : undefined,
      name: searchMode === "nombre" ? name : undefined,
    };

    try {
      const res = await fetch("/api/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: searchValue.trim(), selections }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setError(err.error || "Request failed");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: StreamEvent;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === "log") {
            setLogs((prev) => [...prev, evt.line]);
          } else if (evt.type === "result") {
            if (evt.status === "success" && evt.data) {
              setData(evt.data);
              setLastVehicle(evt.data);
              setExportPlate(evt.data.plate || "");
              setTransmissionType(evt.data.general.traccion || "");
            } else {
              setError(evt.message || "Vehículo no encontrado");
            }
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setLogs((prev) => [...prev, "[CLIENT] Consulta cancelada por el usuario."]);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  // Build the full "Informe Pericial del Vehículo" report following the
  // "Argumentos periciales placa.docx" template.
  const buildReport = () => {
    if (!data) return "";
    return buildVehicleReport(data, {
      odometer,
      transmissionType,
      plate: exportPlate,
    });
  };

  const handleExportTxt = () => {
    if (!data) return;
    const report = buildReport();
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-pericial-${data.plate.replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(renderReportHtml(data, { odometer, transmissionType, plate: exportPlate }));
    win.document.close();
    win.focus();
    win.print();
  };

  const handleExportDocx = async () => {
    if (!data) return;
    const blob = await buildReportDocx(data, { odometer, transmissionType, plate: exportPlate });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-pericial-${data.plate.replace(/\s+/g, "-")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download the current page exactly as it looks, as a standalone HTML file.
  const handleExportHtml = () => {
    if (!data) return;
    const html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pagina-${data.plate.replace(/\s+/g, "-")}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download both the RNP result PDF (the Registro Nacional page as it
  // appeared after the form was filled and submitted) and the Word document
  // in one click.
  const handleExportRnpPdfAndDocx = async () => {
    if (!data) return;
    if (data.resultPdfBase64) {
      const byteChars = atob(data.resultPdfBase64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const pdfBlob = new Blob([bytes], { type: "application/pdf" });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = pdfUrl;
      a.download = `rnp-resultado-${data.plate.replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(pdfUrl);
    } else {
      setError("No se pudo capturar el PDF del Registro Nacional.");
      return;
    }
    const blob = await buildReportDocx(data, { odometer, transmissionType, plate: exportPlate });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe-pericial-${data.plate.replace(/\s+/g, "-")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const codeClasses = formOptions?.codeClasses?.length ? formOptions.codeClasses : ["CL"];

  return (
    <main className={styles.container}>
      <Reveal>
        <header className={styles.header}>
          <h1 className={styles.title}>RNP Digital Scraper</h1>
          <p className={styles.subtitle}>
            Servicio de scraping del Registro Nacional de Costa Rica
          </p>
        </header>
      </Reveal>

      <Reveal delay={0.1}>
      <section className={styles.searchSection}>
        <h2 className={styles.searchTitle}>Consulta Registral</h2>
        <p className={styles.searchSubtitle}>
          Selecciona el tipo de consulta y completa los campos que aparecen
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Step 1: Consultation type */}
          <div className={styles.step}>
            <span className={styles.stepLabel}>1. Tipo de consulta</span>
            <div className={styles.radioRow}>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="consultationType"
                  checked={consultationType === "vehiculo"}
                  onChange={() => setConsultationType("vehiculo")}
                  disabled={loading}
                />
                Consulta de Vehículo
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  name="consultationType"
                  checked={consultationType === "polizas"}
                  onChange={() => setConsultationType("polizas")}
                  disabled={loading}
                />
                Consulta de Pólizas
              </label>
            </div>
          </div>

          {consultationType === "vehiculo" && (
            <>
              {/* Step 2: Search mode */}
              <div className={styles.step}>
                <span className={styles.stepLabel}>2. Modo de búsqueda</span>
                <div className={styles.radioRow}>
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="searchMode"
                      checked={searchMode === "vin"}
                      onChange={() => setSearchMode("vin")}
                      disabled={loading}
                    />
                    Número de VIN
                  </label>
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="searchMode"
                      checked={searchMode === "placa"}
                      onChange={() => setSearchMode("placa")}
                      disabled={loading}
                    />
                    Número de Placa
                  </label>
                  <label className={styles.radio}>
                    <input
                      type="radio"
                      name="searchMode"
                      checked={searchMode === "nombre"}
                      onChange={() => setSearchMode("nombre")}
                      disabled={loading}
                    />
                    Nombre
                  </label>
                </div>
              </div>

              {/* Step 3: Conditional input */}
              <div className={styles.step}>
                <span className={styles.stepLabel}>3. Datos del vehículo</span>
                {searchMode === "vin" && (
                  <div className={styles.formRow}>
                    <input
                      className={styles.input}
                      type="text"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                      placeholder="MMBJLKL10NH027545"
                      disabled={loading}
                    />
                  </div>
                )}
                {searchMode === "placa" && (
                  <div className={styles.formRow}>
                    <input
                      className={styles.input}
                      type="text"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                      placeholder="CL 330873"
                      disabled={loading}
                    />
                    <select
                      className={styles.select}
                      value={codeClass}
                      onChange={(e) => setCodeClass(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Clase de código (opcional)</option>
                      {codeClasses.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {searchMode === "nombre" && (
                  <div className={styles.formRow}>
                    <input
                      className={styles.input}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nombre del propietario"
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {consultationType === "polizas" && (
            <div className={styles.step}>
              <span className={styles.stepLabel}>Consulta de Pólizas</span>
              <p className={styles.hint}>
                La consulta de pólizas aún no está disponible. Selecciona
                "Consulta de Vehículo" para continuar.
              </p>
            </div>
          )}

          {optionsError && <div className={styles.warning}>{optionsError}</div>}

          <div className={styles.formRow}>
            <button
              className={styles.button}
              type="submit"
              disabled={loading || !searchValue.trim() || consultationType === "polizas"}
            >
              {loading ? "Consultando..." : "Consultar"}
            </button>
            {loading && (
              <button
                className={styles.buttonCancel}
                type="button"
                onClick={handleCancel}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        {error && <div className={styles.error}>{error}</div>}

        {data && (
          <div className={styles.results}>
            <div className={styles.exportRow}>
              <label className={styles.exportField}>
                <span className={styles.fieldLabel}>Odómetro (km)</span>
                <input
                  className={styles.input}
                  type="text"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  placeholder="Ej: 45000"
                />
              </label>
              <label className={styles.exportField}>
                <span className={styles.fieldLabel}>Transmisión</span>
                <input
                  className={styles.input}
                  type="text"
                  value={transmissionType}
                  onChange={(e) => setTransmissionType(e.target.value)}
                  placeholder="AUTOMÁTICA / MANUAL"
                />
              </label>
              <label className={styles.exportField}>
                <span className={styles.fieldLabel}>Placa</span>
                <input
                  className={styles.input}
                  type="text"
                  value={exportPlate}
                  onChange={(e) => setExportPlate(e.target.value)}
                  placeholder="CL 330873"
                />
              </label>
              <button className={styles.button} type="button" onClick={handleExportTxt}>
                Exportar TXT
              </button>
              <button className={styles.button} type="button" onClick={handleExportPdf}>
                Exportar PDF
              </button>
              <button className={styles.button} type="button" onClick={handleExportDocx}>
                Exportar DOCX
              </button>
              <button className={styles.button} type="button" onClick={handleExportHtml}>
                Exportar HTML
              </button>
              <button className={styles.button} type="button" onClick={handleExportRnpPdfAndDocx}>
                PDF RNP + Word
              </button>
            </div>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Vehículo</h2>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <span className={styles.label}>Placa</span>
                  <span className={styles.value}>{data.plate}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Marca</span>
                  <span className={styles.value}>{data.general.marca}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Estilo</span>
                  <span className={styles.value}>{data.general.estilo}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Categoría</span>
                  <span className={styles.value}>{data.general.categoria}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Año</span>
                  <span className={styles.value}>{data.general.anioFabricacion}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Color</span>
                  <span className={styles.value}>{data.general.color}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Estado</span>
                  <span className={styles.value}>{data.general.estadoActual}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Uso</span>
                  <span className={styles.value}>{data.general.uso}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Valor Hacienda</span>
                  <span className={styles.value}>{data.general.valorHacienda}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>VIN</span>
                  <span className={styles.value}>{data.general.vin}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Chasis</span>
                  <span className={styles.value}>{data.general.chasis}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Tracción</span>
                  <span className={styles.value}>{data.general.traccion}</span>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Motor</h2>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <span className={styles.label}>N. Motor</span>
                  <span className={styles.value}>{data.engine.numeroMotor}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Marca</span>
                  <span className={styles.value}>{data.engine.marca}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Modelo</span>
                  <span className={styles.value}>{data.engine.modelo}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Cilindrada</span>
                  <span className={styles.value}>{data.engine.cilindrada}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Cilindros</span>
                  <span className={styles.value}>{data.engine.cilindros}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Potencia</span>
                  <span className={styles.value}>{data.engine.potencia}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Combustible</span>
                  <span className={styles.value}>{data.engine.combustible}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Procedencia</span>
                  <span className={styles.value}>{data.engine.procedencia}</span>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Inscripción</h2>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <span className={styles.label}>Tomo</span>
                  <span className={styles.value}>{data.registration.tomo}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Asiento</span>
                  <span className={styles.value}>{data.registration.asiento}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Secuencia</span>
                  <span className={styles.value}>{data.registration.secuencia}</span>
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Fecha</span>
                  <span className={styles.value}>{data.registration.fecha}</span>
                </div>
              </div>
            </section>

            {data.owners.length > 0 && (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Propietario(s)</h2>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tipo Identificación</th>
                      <th>Número</th>
                      <th>Nombre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.owners.map((o, i) => (
                      <tr key={i}>
                        <td>{o.tipoIdentificacion}</td>
                        <td>{o.numeroIdentificacion}</td>
                        <td>{o.nombre}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Estado Registral</h2>
              <div className={styles.flags}>
                <span className={`${styles.flag} ${data.flags.gravamenes ? styles.flagYes : styles.flagNo}`}>
                  {data.flags.gravamenes ? "Tiene Gravamenes" : "No Posee Gravamenes"}
                </span>
                <span className={`${styles.flag} ${data.flags.anotaciones ? styles.flagYes : styles.flagNo}`}>
                  {data.flags.anotaciones ? "Tiene Anotaciones" : "No Posee Anotaciones"}
                </span>
                <span className={`${styles.flag} ${data.flags.infracciones ? styles.flagYes : styles.flagNo}`}>
                  {data.flags.infracciones ? "Tiene Infracciones" : "No Posee Infracciones"}
                </span>
                <span className={`${styles.flag} ${data.flags.levantamientos ? styles.flagYes : styles.flagNo}`}>
                  {data.flags.levantamientos ? "Tiene Levantamientos" : "No Posee Levantamientos"}
                </span>
              </div>
            </section>
          </div>
        )}

        {logs.length > 0 && (
          <Reveal>
            <section className={styles.logs}>
              <h2 className={styles.logsTitle}>Server Logs</h2>
              <pre className={styles.logsPre}>{logs.join("\n")}</pre>
            </section>
          </Reveal>
        )}
      </section>
      </Reveal>

      <Reveal delay={0.15}>
      <section className={styles.body}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>API Endpoint</h2>
          <code className={styles.code}>POST /api/scrape</code>
          <p className={styles.description}>
            Streams real-time server logs as NDJSON while scraping property
            data from rnpdigital.com.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Vehicle API</h2>
          <code className={styles.code}>POST /api/vehicle</code>
          <p className={styles.description}>
            Scrapes vehicle data by VIN, placa, or nombre with LLM extraction.
          </p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Form Options</h2>
          <code className={styles.code}>GET /api/vehicle/options</code>
          <p className={styles.description}>
            Extracts the RNP form dropdown options (clase de código, etc.).
          </p>
        </div>
      </section>
      </Reveal>

      <Reveal delay={0.2}>
        <footer className={styles.footer}>
          <span>Backend-only project · Next.js + SCSS Modules</span>
        </footer>
      </Reveal>
    </main>
  );
}
