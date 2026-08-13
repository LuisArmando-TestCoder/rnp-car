# RNP Digital Scraper

Backend-only Next.js service that scrapes property and vehicle data from the Costa Rica
National Registry portal (**rnpdigital.com**), with structured server-side
logging and NDJSON streaming.

- **Next.js 16** (App Router, backend-only)
- **No Tailwind** – uses **SCSS Modules** only
- **Playwright** for headless browser automation
- **Zod** for request validation
- **OpenRouter LLM** for intelligent vehicle data extraction
- **NDJSON streaming** API routes that mirror the `propertycertify` backend pattern

## Project Layout

```
rnp-digital-scraper/
├── scripts/
│   ├── scrape-cli.ts          # npm run scrape -- finca=1-23456-000
│   └── login-only.ts          # npm run login (test credentials)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── scrape/route.ts   # POST /api/scrape (property, NDJSON stream)
│   │   │   ├── vehicle/route.ts  # POST /api/vehicle (vehicle by VIN)
│   │   │   └── health/route.ts   # GET /api/health
│   │   ├── layout.tsx
│   │   ├── page.tsx              # landing page (SCSS module)
│   │   ├── page.module.scss
│   │   └── vehicle/
│   │       ├── page.tsx          # vehicle lookup page (SCSS module)
│   │       └── vehicle.module.scss
│   ├── lib/
│   │   ├── openRouter.ts         # OpenRouter LLM client
│   │   └── rnp/
│   │       ├── index.ts          # barrel exports
│   │       ├── types.ts          # shared types
│   │       ├── logger.ts         # structured server-side logging
│   │       ├── auth.ts           # rnpdigital login/logout
│   │       ├── navigation.ts     # navigate to property search
│   │       ├── search.ts         # fill & submit finca search form
│   │       ├── parsers.ts        # extract property data & gravamen details
│   │       ├── scraper.ts        # main Playwright orchestration (property)
│   │       ├── vehicle-scraper.ts    # vehicle scraping by VIN
│   │       ├── vehicle-parser.ts     # DOM-based vehicle extraction
│   │       ├── vehicle-llm-parser.ts # LLM-based vehicle extraction
│   │       ├── credentials.ts    # credential management
│   │       └── env.ts            # env loading (CLI + server)
│   └── types/
│       └── scss.d.ts             # SCSS module type declarations
└── tests/
    └── vehicle-scrape.spec.ts    # Playwright vehicle scrape tests
```

## Setup

```bash
npm install          # also runs playwright install chromium
cp .env.example .env # fill in RNP_CREDENTIALS and OPENROUTER_API_KEY
```

Required env vars:

- `RNP_CREDENTIALS` – composite format `user:pass~user:pass`
- `OPENROUTER_API_KEY` – for LLM-based vehicle data extraction

## API

### `POST /api/scrape`

Scrapes a property and streams real-time server logs as **NDJSON**.

**Request body:**

```json
{
  "finca": "1-23456-000",
  "province": "1",
  "credentials": { "user": "user@email.com", "pass": "secret" },
  "headless": true
}
```

- `finca` (required) – accepts `"1-23456-000"`, `"23456"`, `"1-23456"`, or an `F`-suffixed condo format `"1-23456-F"`.
- `province` (optional) – province code `1`–`7`, defaults to `1`.
- `credentials` (optional) – overrides `RNP_CREDENTIALS` env var credentials.
- `headless` (optional, default `true`) – set `false` to watch the browser in development.

**Response (NDJSON stream):**

```
{"type":"start","finca":"1-23456-000","province":"1"}
{"type":"log","line":"[timestamp] [INFO] [SCRAPER] STAGE 1 - Loading RNP Digital page..."}
{"type":"log","line":"[timestamp] [INFO] [SCRAPER] STAGE 2 - Performing secure login..."}
...
{"type":"result","status":"success","data":{...}}
```

### `POST /api/vehicle`

Scrapes vehicle data by VIN and streams real-time server logs as **NDJSON**.

**Request body:**

```json
{
  "vin": "MMBJLKL10NH027545",
  "credentials": { "user": "user@email.com", "pass": "secret" },
  "headless": true
}
```

- `vin` (required) – 17-character VIN.
- `credentials` (optional) – overrides `RNP_CREDENTIALS` env var credentials.
- `headless` (optional, default `true`).

**Response (NDJSON stream):**

```
{"type":"start","vin":"MMBJLKL10NH027545"}
{"type":"log","line":"[timestamp] [INFO] [SCRAPER] STAGE 1 - Loading RNP Digital page..."}
...
{"type":"result","status":"success","data":{...}}
```

**Scraped vehicle data shape:**

```jsonc
{
  "plate": "CL 330873",
  "general": {
    "marca": "MITSUBISHI",
    "estilo": "L200",
    "vin": "MMBJLKL10NH027545",
    "chasis": "MMBJLKL10NH027545",
    "color": "...",
    "anio": "...",
    "tipo": "...",
    "carroceria": "..."
  },
  "engine": {
    "numeroMotor": "...",
    "combustible": "DIESEL"
  },
  "registration": {
    "tomo": "...",
    "asiento": "...",
    "fechaInscripcion": "..."
  },
  "owners": [
    {
      "nombre": "INTERBREMACR...",
      "tipo": "Person" | "Company",
      "cedula": "..."
    }
  ],
  "flags": {
    "gravamenes": false,
    "anotaciones": false,
    "infracciones": false,
    "levantamientos": false
  },
  "rawText": "...",
  "scrapedAt": "ISO timestamp"
}
```

### `GET /api/health`

Returns service status and configured RNP environment.

## CLI

Run a property scrape directly from the terminal (server-side):

```bash
npm run scrape -- finca=1-23456-000 province=1 headless=false
```

Run a vehicle scrape by VIN:

```bash
npm run vehicle -- vin=MMBJLKL10NH027545 headless=false
```

Credentials are read from `.env` (`RNP_CREDENTIALS` in `user:pass~user:pass` format) or passed inline:

```bash
npm run scrape -- finca=1-23456-000 user=you@domain.com pass=secret
```

## Scraping Pipeline (Property)

1. **STAGE 1** – Load `https://www.rnpdigital.com/shopping/login.jspx`
2. **STAGE 2** – Secure login (retry once with cleared cookies)
3. **STAGE 3** – Navigate to the "Consulta Por Número de Finca" form
4. **STAGE 4** – Fill province / finca / condominium and submit search
5. **STAGE 5** – Extract property header + owners table
6. **STAGE 6** – Deep-dive into gravamenes (CITAS details) per owner
7. **Clean exit** – Safe logout & browser close to prevent RNP account locks

## Scraping Pipeline (Vehicle)

1. **STAGE 1** – Load RNP Digital login page
2. **STAGE 2** – Secure login (retry once with cleared cookies)
3. **STAGE 3** – Navigate to the vehicle consultation form
4. **STAGE 4** – Select "Número de VIN" search type
5. **STAGE 5** – Fill the VIN
6. **STAGE 6** – Submit the search
7. **STAGE 7** – Extract vehicle data via LLM (OpenRouter)
8. **Clean exit** – Safe logout & browser close

## Tests

```bash
npm test   # runs Playwright vehicle scrape tests
```

Tests cover:
- Successful vehicle scrape by VIN with LLM extraction
- Invalid VIN returns `not_found` status

## Notes

- All scraping runs on the **server side** – nothing sensitive is exposed to the client.
- The `/api/scrape` and `/api/vehicle` routes use `export const maxDuration = 120` for long-running scrapes on hosts that support it.
- Set `headless: false` + `takeCharge: true` (not exposed via API yet) to drive the browser manually.# rnp-car
