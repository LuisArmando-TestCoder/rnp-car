import { NextRequest } from "next/server";
import { scrapeVehicleData } from "@/lib/rnp";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VehicleRequestSchema = z.object({
  vin: z.string().optional(),
  credentials: z
    .object({
      user: z.string().optional(),
      pass: z.string().optional(),
    })
    .optional(),
  headless: z.boolean().optional().default(true),
  selections: z
    .object({
      consultationType: z.enum(["vehiculo", "polizas"]).optional(),
      searchMode: z.enum(["vin", "placa", "nombre"]).optional(),
      searchType: z.string().optional(),
      documentType: z.string().optional(),
      vehicleType: z.string().optional(),
      codeClass: z.string().optional(),
      plate: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/vehicle
 * Scrapes vehicle data from RNP Digital by VIN and streams server logs as NDJSON.
 *
 * Request body:
 *   { vin: "MMBJLKL10NH027545", credentials?: { user, pass } }
 *
 * Response: NDJSON stream
 *   {"type":"log","level":"info","scope":"SCRAPER","message":"...","timestamp":"..."}
 *   {"type":"result","status":"success","data":{...}}
 *   {"type":"error","message":"..."}
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VehicleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { vin, headless, selections } = parsed.data;
  const credentials =
    parsed.data.credentials?.user && parsed.data.credentials?.pass
      ? { user: parsed.data.credentials.user, pass: parsed.data.credentials.pass }
      : undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch (e) {
          console.error("[API] Failed to enqueue:", e);
        }
      };

      try {
        send({ type: "start", vin });

        const result = await scrapeVehicleData(vin || "", {
          credentials,
          headless,
          selections,
          signal: req.signal,
          onLog: (line) => {
            send({ type: "log", line });
          },
        });

        if (result.status === "error") {
          send({ type: "error", message: result.error });
        } else if (result.status === "not_found") {
          send({ type: "result", status: "not_found", message: result.error });
        } else {
          send({ type: "result", status: "success", data: result.data });
        }
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}