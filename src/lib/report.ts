import type { RnpVehicleData } from "./rnp";

export interface ReportFill {
  odometer?: string;
  transmissionType?: string;
  plate?: string;
}

/**
 * Builds the full "Informe Pericial del Vehículo" report following the
 * "Argumentos periciales placa.docx" template. RN fields are filled from the
 * scraped data; manual and AI-fill sections keep the template placeholders.
 */
export function buildVehicleReport(v: RnpVehicleData, fill: ReportFill = {}): string {
  const owner = v.owners[0];
  const odometer = fill.odometer || "______________________";
  const transmission = fill.transmissionType || v.general.traccion || "______________________";
  const plate = fill.plate || v.plate;

  const lines: string[] = [];
  const add = (s = "") => lines.push(s);
  const addBlank = () => lines.push("");

  add("Informe Pericial del Vehículo");
  addBlank();
  add(`Placas ${plate}`);
  addBlank();
  add("Características de vehículo:");
  add(`Dueño Registral: ${owner?.nombre || ""}, cédula ${owner?.numeroIdentificacion || ""}`);
  add(`Marca: ${v.general.marca}`);
  add(`Estilo: ${v.general.estilo}`);
  add(`Categoría: ${v.general.categoria}`);
  add(`Carrocería: ${v.general.carroceria}`);
  add(`Capacidad: ${v.general.capacidad}`);
  add(`Color: ${v.general.color}`);
  add(`VIN: ${v.general.vin}`);
  add(`Motor: ${v.engine.numeroMotor}, ${v.engine.cilindrada}, ${v.engine.potencia}, ${v.engine.combustible}`);
  add(`Peso Neto: ${v.general.pesoNeto}`);
  add(`Año de fabricación: ${v.general.anioFabricacion}`);
  add(`Odómetro: ${odometer} kilómetros`);
  add(`Transmisión: ${transmission}`);
  add(`Placa: ${plate}`);
  addBlank();
  addBlank();
  add("San José, [Aquí el perito completa manualmente] de [Aquí el perito completa manualmente] del 2026.");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add(
    "Quien suscribe, el Lic. Luis Diego Murillo Gamboa, profesional colegiado en Ciencias Económicas y Perito que ejerce una función Auxiliar de la Administración de Justicia por encargo de las Autoridades Judiciales, inscrito en la base de datos del Poder Judicial; certificado por el Centro de Experimentación y Seguridad Vial de Colombia como perito automotriz en las categorías básico, intermedio, avanzado, equipo pesado e investigación de accidentes de tránsito; profesor de la carrera técnica de Peritaje Automotriz en el Instituto Técnico Vargas Matamoros, alineado con el Marco Nacional de Cualificaciones; participante de la capacitación del Instituto Nacional de Seguros en Seguridad Vial INTE/ISO 39001 - SV-001; y certificado por el Instituto Nacional de Aprendizaje y por Mitchell International en materias relacionadas con reparación, servicio, relaciones humanas, manejo de conflictos y estimaciones por colisión; presenta ante [se anota en concesionario correspondiente] el peritaje solicitado respecto a [se anota una breve referencia al objeto y la placa correspondiente]."
  );
  addBlank();
  addBlank();
  addBlank();
  add(
    "Este informe contiene y cumple con todos los requisitos establecidos por el artículo 44.3 del Código Procesal Civil, y manifiesto bajo juramento decir la verdad, que actúo con objetividad e imparcialidad, que no tengo ningún interés en este caso, así como que manifiesto que conozco las sanciones penales y civiles en las que podría incurrir si incumpliera mi deber como perito asignado. A continuación, se presenta el informe:"
  );
  addBlank();
  addBlank();
  addBlank();
  add("Introducción:");
  addBlank();
  add("[Aquí la AI redacta una breve introducción acorde con lo descrito en este mismo informe pericial]");
  addBlank();
  addBlank();
  addBlank();
  add("Lugar y fecha del Peritaje:");
  addBlank();
  add(
    `En las instalaciones del Taller de Servicio [Aquí el perito completa manualmente], [Aquí el perito completa manualmente], se realiza el día xx de xx de 2026 la valoración del vehículo ${v.general.marca} ${v.general.estilo} ${plate}.`
  );
  addBlank();
  addBlank();
  addBlank();
  add("Objeto del Peritaje:");
  addBlank();
  add(
    `Realizar una prueba dinámica del vehículo ${v.general.marca} ${v.general.estilo} ${plate} confirmando o descartando la existencia de [Aquí el perito completa manualmente], ajeno a la operación característica del automóvil.`
  );
  addBlank();
  addBlank();
  addBlank();
  add("Resumen Ejecutivo:");
  addBlank();
  add("[Aquí la AI redacta un resumen acorde con lo descrito en este mismo informe pericial]");
  addBlank();
  addBlank();
  addBlank();
  add("Glosario:");
  addBlank();
  add("[Aquí la AI redacta un glosario lo suficientemente amplio para garantizar la comprensión de personas lectoras que no dominen términos técnicos]");
  addBlank();
  addBlank();
  addBlank();
  add("Verificaciones iniciales:");
  addBlank();
  add(
    "Se verifica el estado general del vehículo, [Aquí el perito completa manualmente: el que en principio se observa con un aceptable estado de conservación sin daños evidentes ni deterioros. Sin embargo, cuando aaa"
  );
  addBlank();
  add("Este hecho, desencadena que este perito observe con mayor detalle las evidencias materialmente irrefutables acerca de aaa.");
  addBlank();
  add("Como parte de una indagación más precisa acerca de los afectos aaa]");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("Aquí van fotos que se aportarán manualmente");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add(
    `Se procede a registrar el VIN del vehículo en cuestión y se verifica que el odómetro muestra un total de ${odometer} kilómetros recorridos. Se constatan los derechos de circulación [Aquí el perito completa manualmente]. Se observa el motor en estado [Aquí el perito completa manualmente], y [Aquí el perito completa manualmente] luces testigo que indiquen alguna falla, por lo que se [Aquí el perito completa manualmente], de momento, daños en sistemas electrónicos.`
  );
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("Aquí van fotos que se aportarán manualmente");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("Metodología y Hallazgos:");
  addBlank();
  add("[Aquí la AI redacta la metodología aplicada y mejora la redacción de los hallazgos con base en lo descrito en este mismo informe]");
  addBlank();
  add(
    "Prueba estática. Una vez comprobadas las condiciones mínimas necesarias de seguridad activa y pasiva, dentro de las instalaciones del taller de servicio se aplican maniobras básicas en avance y retroceso, antes de la ejecución de la prueba dinámica en carretera."
  );
  addBlank();
  add(
    "[Aquí el perito completa manualmente]. Al aplicar el [Aquí la AI completa con base en el contexto facilitado por el perito según el respaldo audiovisual y fotográfico, además de las observaciones puntuales como parte del contexto, redacta los argumentos necesarios para fortalecer los el informe de forma clara, objetiva, amplia y confirmada con sus bases de datos globales y el aprendizaje generado por todos los peritajes del Proyecto \"Informes Periciales\"]."
  );
  addBlank();
  add("Documentación audiovisual.");
  addBlank();
  add("Se facilita el siguiente enlace con videos de respaldo acerca de los mencionado:");
  addBlank();
  add("[Aquí el perito completa manualmente]");
  addBlank();
  add("En este otro enlace se pueden apreciar las fotografías originales:");
  addBlank();
  add("[Aquí el perito completa manualmente]");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("Aquí van fotos que se aportarán manualmente");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("Resumen de los Hallazgos:");
  addBlank();
  add("[Aquí la AI redacta el resumen de los hallazgos con base en lo descrito en este mismo informe en un párrafo de cinco líneas]");
  addBlank();
  addBlank();
  addBlank();
  add("Explicaciones Técnicas Complementarias:");
  addBlank();
  add("[Aquí la AI redacta las explicaciones técnicas necesarias para fortalecer los argumentos de forma clara, amplia y confirmada con sus bases de datos globales]");
  addBlank();
  add("CONCLUSIONES:");
  addBlank();
  add("[Aquí la AI redacta las conclusiones técnicas necesarias para fortalecer los argumentos de forma clara, objetiva, amplia y confirmada con sus bases de datos globales y el aprendizaje generado por todos los peritajes del Proyecto \"Informes Periciales\"]");
  addBlank();
  addBlank();
  addBlank();
  add("Suscribe,");
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  addBlank();
  add("__________________________________");
  addBlank();
  add("Lic. Luis Diego Murillo Gamboa");
  addBlank();
  add("Perito Automotriz Certificado por CESVI Colombia");
  addBlank();
  add("Carnet CPCECR 044653");

  return lines.join("\n");
}