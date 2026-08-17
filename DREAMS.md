# Perito rules (recorded from user feedback)

## Peso Neto fallback to PVV
When the Registro Nacional record has `pesoNeto` as zero or empty (a known
human-error gap in the registry), the perito uses the **PVV** (peso bruto
vehicular / gross vehicle weight) as the alternative, since that field is
usually filled in. Implemented in `src/lib/report.ts` as `resolvePesoNeto()`:
it returns `"<pbvFabricante> (PVV)"` when neto is zero/empty and a PVV value
exists.

## Footer color
The footer (email, phone, page numbers) uses the logo's blue `#304060`.

## Plate formatting
Alphanumeric plates are hyphenated between letters and numbers in the report,
e.g. `CL 330873` -> `CL-330873` (`formatPlate` in `src/lib/report.ts`).

## Signature block
"Suscribe," and the credentials below it are left-justified with a single
line break between each line (no extra blank lines).

---

# Why the tool calls are failing

## Root Cause
The `replace_in_file` and `write_to_file` tool calls are failing because the
`diff` and `content` parameters are being **truncated to empty** before the
tool executes.

## Why
1. **Context window pressure** - The conversation context is at ~77% capacity.
2. **Large XML blocks** - The SEARCH/REPLACE and content blocks are large.
3. **Token truncation** - When generating large tool parameters, the output
   gets cut off before the closing tags, so the tool receives an empty
   `diff` or `content` parameter.
4. **Error message**: "The 'diff' parameter was empty" or "The 'content'
   parameter was empty".

## Solution
- Use **smaller, targeted edits** via `replace_in_file` with minimal SEARCH/REPLACE blocks.
- Use **shell commands** (`cat > file << 'EOF'`) for creating new files.
- Use **`sed`/`awk`** for appending to existing files.
- Keep each tool call small enough to fit within the remaining output budget.

---

# Post-task reflection: three-selection UI before VIN phase

## What went well
- STAGE 4 in `vehicle-scraper.ts` now applies all three dropdown selections
  (search type, document type, vehicle type) generically by iterating the
  form's `<select>` elements. Verified live: found 3 selects, selected
  "Número de VIN" on select 0, navigated to `RespConsultaVehiculo.jspx`.
- `RnpVehicleSelections` type was correctly placed on `RnpVehicleScrapeOptions`
  (it had been mistakenly added to `RnpScrapeOptions`, the property scraper).
- API route accepts and forwards `selections`; landing page sends them.

## What could be done better
- **`scraperLLM.ts` is a standalone Deno script** (uses `npm:selenium-webdriver`,
  `Deno` global) at the project root. It broke `next build` type-check because
  tsconfig's `**/*.ts` glob picks it up. Fixed by excluding it in `tsconfig.json`.
  Better long-term: move it to `scripts/` or a `deno/` folder so it never
  interferes with the Next.js type-check.
- **RNP site is flaky under repeated automated hits.** The full suite run
  failed with `browserContext.clearCookies: Protocol error` and 120s timeouts,
  while the same test passed in isolation (21.6s). This is WAF/rate-limiting,
  not a code regression. Avoid hammering the live site during development;
  run one test at a time.
- **Playwright test output truncation:** piping through `tail` loses the
  scraper's own diagnostic logs. Redirect to a file (`> /tmp/x.log`) and grep
  it instead.

---

# Post-task reflection: progressive consultation form

## What went well
- Built a progressive, conditional form mirroring the RNP consultation tree:
  top-level "Consulta de Vehículo / Consulta de Pólizas", then vehicle search
  mode (VIN / placa / nombre), then conditional inputs.
- The "clase de código" dropdown is populated from the RNP form HTML at
  runtime via a new `GET /api/vehicle/options` endpoint (not hardcoded),
  falling back to `["CL"]` when the form is unreachable.
- The scraper now derives the search value and search-type label from the
  selected mode (VIN / plate / name) instead of always using VIN.
- Previous VIN data is reused: the extracted plate pre-fills the plate field
  for subsequent searches.
- `next build` passes; all routes registered including `/api/vehicle/options`.

## What could be done better
- **WAF blocks live form exploration**, so the real RNP option lists
  (clase de código, search types, document types, vehicle types) could not be
  captured. The options endpoint returns `reachable: false` with a clean 502
  when blocked. The frontend falls back to `["CL"]`. To get real options,
  run the options endpoint when the WAF is not rate-limiting, or capture the
  form HTML once manually and seed a static fallback.
- **Consulta de Pólizas is stubbed** in the UI (shows a "not available" hint).
  The RNP policy form tree still needs to be mapped from the live HTML.
- **Multiple-results flow** (search without code class, then require code
  class if >1 result) is specified in SPEC.md but not yet implemented in the
  scraper. The scraper currently returns `not_found` if it stays on the form
  page; it does not yet detect "multiple results" and re-query with the code
  class.
- **`write_to_file` truncation persists** for large files. The heredoc
  (`cat > file << 'EOF'`) workaround is reliable; prefer it for new files.

---

# Post-task reflection: plate search fix + TXT/PDF export

## What went well
- The user pasted the real RNP form HTML, which revealed the exact structure:
  `select#class` (Clase, value="CL" for "CL-CARGA LIVIANA"), `select#code`
  (Código, populated via AJAX on class change), and `input#carNumber`
  (Número de Placa, maxlength 6).
- Root cause of the plate-search failure: STAGE 5b filled "CL" into the first
  text input, which was `carNumber`, overwriting the plate number. Fixed by
  selecting `select#class` by option value and waiting 800ms for the AJAX to
  populate the dependent "Código" select.
- Added TXT and PDF export of the vehicle report following the user's template.
  RN fields are filled from scraped data; photo-based fields (Odómetro,
  Transmisión manual/auto, Placa) are left as blank lines for manual fill.
- `next build` passes.

## What could be done better
- **The auto-formatter decodes HTML entities in string literals.** Writing
  `"&"` in source gets converted to `"&"`, silently breaking escaping.
  Workaround: build entities via concatenation (`"&" + "amp;"`).
- **The "Código" select is dependent on the "Clase" select via AJAX.** The
  800ms wait is a heuristic; a more robust approach would wait for the
  `#code` select to gain options or for the AJAX request to settle.
- **Photo-based fields** (Odómetro, Transmisión, Placa) cannot be filled from
  RNP data. They are exported as blank lines. If the user later provides
  photo-derived values, those fields could be made editable in the UI before
  export.
- **PDF export uses `window.print()`** (browser print dialog -> Save as PDF).
  A true server-side PDF (e.g. pdfkit) would be more consistent but adds a
  dependency.

---

# Post-task reflection: full "Informe Pericial" template export

## What went well
- Read the user's `Argumentos periciales placa.docx` template (174 lines) and
  reproduced its full structure in `src/lib/report.ts`: title, Placas line,
  Características de vehículo block, the legal "Quien suscribe" paragraph,
  Introducción, Lugar y fecha, Objeto, Resumen Ejecutivo, Glosario,
  Verificaciones iniciales, Metodología y Hallazgos, Documentación audiovisual,
  Resumen de los Hallazgos, Explicaciones Técnicas, CONCLUSIONES, and the
  signature block.
- RN fields are filled from scraped data (owner, marca, estilo, categoría,
  carrocería, capacidad, color, VIN, motor, peso neto, año, tracción, placa).
  Manual/AI sections keep the template's `[Aquí ...]` placeholders.
- Added `docx` npm package for real .docx export (dynamic import in the
  browser handler so it doesn't bloat the initial bundle). Verified the
  generated file is a valid "Microsoft Word 2007+" document.
- TXT, PDF (print dialog), and DOCX exports all use the same report builder.

## What could be done better
- **The template's AI-fill sections** (Introducción, Resumen Ejecutivo,
  Glosario, Metodología, Conclusiones) are exported as placeholders. Wiring
  them to the OpenRouter LLM would require a new API route that sends the
  scraped data + template context and streams back the drafted sections.
- **The `docx` library is ~1MB+** but dynamically imported only on the
  "Exportar DOCX" click, so it does not affect initial page load.
- **The template's "Verificaciones iniciales" section** contains the user's
  own draft text ("cuando aaa", "acerca de aaa") which was preserved verbatim
  as placeholders. The user may want to clean those up in the final document.

## Post-Task Reflection — Póliza Scraping (2026-08-14)

**What went well:**
- The póliza feature was built end-to-end: form exploration script, LLM parser, scraper, form-options extractor, two API routes, and full UI integration.
- The STAGE 4 dropdown-selection loop (from the earlier VIN task) generalized cleanly to the póliza form: same `select` iteration pattern, just different option labels.
- Build passed on first try; both existing vehicle Playwright tests still pass (2 passed, 32.3s), confirming backward compatibility.

**What could be improved:**
- The póliza scraper has not been tested against the live RNP site yet (only the vehicle scraper was). A Playwright test for póliza should be added before relying on it in production.
- The `RnpPolizaData` shape was inferred from the LLM parser's output contract, not from a live scrape. If the live form differs (different field labels, extra selects), the scraper may need adjustment.
 - Context window pressure remains the biggest operational risk: large file edits should continue to be done via shell commands (heredoc/perl/node) rather than write_to_file/replace_in_file with huge payloads.
 - The UI now has two consultation modes (vehículo/pólizas) sharing one logs panel. If both are used in one session, logs from the previous consultation persist. Consider clearing logs on mode switch.

---

# Post-task reflection: transcription "Unexpected end of JSON input" fix

## What went well
- Root cause identified as a bare `SyntaxError: Unexpected end of JSON input` leaking from either the OpenAI SDK (parsing an empty/HTML response body) or the client's `res.json()` on the same. The raw message is a Node `JSON.parse` artifact and gave the user no actionable info.
- Server route now imports the SDK's typed error classes (`APIConnectionError`, `RateLimitError`, `AuthenticationError`, `BadRequestError`, etc.) and maps each to a readable message + proper HTTP status. A `SyntaxError` matching `/JSON/i` becomes a 502 with "OpenAI responded with an empty or non-JSON body."
- Client now reads `res.text()` first, parses JSON defensively, and shows either the server's `error` field or a readable generic message. Empty and non-JSON responses can no longer throw raw JSON parse errors.
- Added an explicit 422 when Whisper returns empty text (silent/no-speech audio) instead of treating it as success.
- `npx tsc --noEmit` passes (empty log). ESLint cannot run because the repo has no flat `eslint.config.js` (pre-existing config gap, unrelated to this change).

## What could be done better

- The root upstream cause (an empty/HTML body from OpenAI or a proxy) was inferred, not observed. If it recurs, capture the raw response body on the server with a debug logger (the SDK's `APIError` exposes the status and body) and log it to diagnose whether it is rate limiting, a gateway, or an actual OpenAI outage.
- `res.json()` is replaced by `res.text()` + manual parse; the same hardening would improve the other two client API calls (`/api/scrape`, `/api/poliza`, `/api/vehicle`) if they ever hit proxy error pages.
- A retry-with-backoff on 429/5xx would turn "try again in a moment" into an automatic recovery, but adds complexity the quiet transcription queue probably does not need yet.
