"use client";

import { useState } from "react";
import styles from "./vehicle.module.scss";
import type { RnpVehicleData } from "@/lib/rnp";

type StreamEvent =
  | { type: "start"; vin: string }
  | { type: "log"; line: string }
  | { type: "result"; status: string; data?: RnpVehicleData; message?: string }
  | { type: "error"; message: string };

export default function VehiclePage() {
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [data, setData] = useState<RnpVehicleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin.trim()) return;

    setLoading(true);
    setLogs([]);
    setData(null);
    setError(null);

    try {
      const res = await fetch("/api/vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin: vin.trim() }),
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
            } else {
              setError(evt.message || "Vehicle not found");
            }
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Consulta de Vehículo</h1>
        <p className={styles.subtitle}>
          Busca un vehículo en el Registro Nacional por número de VIN
        </p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="vin">
          Número de VIN
        </label>
        <div className={styles.formRow}>
          <input
            id="vin"
            className={styles.input}
            type="text"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            placeholder="MMBJLKL10NH027545"
            disabled={loading}
          />
          <button className={styles.button} type="submit" disabled={loading || !vin.trim()}>
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {data && (
        <div className={styles.results}>
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
        <section className={styles.logs}>
          <h2 className={styles.logsTitle}>Server Logs</h2>
          <pre className={styles.logsPre}>{logs.join("\n")}</pre>
        </section>
      )}
    </main>
  );
}