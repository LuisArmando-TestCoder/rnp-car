import { parseRnpCredentials } from "@/lib/rnp/env";

export const dynamic = "force-dynamic";

function runHealthChecks() {
  const checks: Array<{ name: string; status: string; detail?: string }> = [];
  const credentialCount = parseRnpCredentials().length;

  checks.push({
    name: "RNP_URL",
    status: process.env.RNP_URL ? "ok" : "warn",
    detail: process.env.RNP_URL || "using default https://www.rnpdigital.com/shopping/login.jspx",
  });

  checks.push({
    name: "RNP_CREDENTIALS",
    status: credentialCount > 0 ? "ok" : "warn",
    detail: credentialCount > 0 ? `${credentialCount} account(s) configured` : "not set (provide credentials per request)",
  });

  return checks;
}

/**
 * GET /api/health
 * Returns service status and configured RNP environment.
 */
export async function GET() {
  const checks = runHealthChecks();
  const ok = checks.every((c) => c.status === "ok");

  return Response.json(
    {
      status: ok ? "ok" : "degraded",
      service: "rnp-digital-scraper",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: ok ? 200 : 200 }
  );
}