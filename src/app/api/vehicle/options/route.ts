import { NextRequest, NextResponse } from "next/server";
import { extractVehicleFormOptions } from "@/lib/rnp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const headless = req.nextUrl.searchParams.get("headless") !== "false";
  const result = await extractVehicleFormOptions({ headless });
  // Always return 200 so the browser doesn't log a failed resource load.
  // The frontend checks `reachable` to show the fallback warning.
  return NextResponse.json(result, { status: 200 });
}
