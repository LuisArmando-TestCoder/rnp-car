import { scrapeVehicleData } from "../src/lib/rnp";
import { getRnpEnvConfig } from "../src/lib/rnp/env";
import { getFirstCredential } from "../src/lib/rnp/credentials";

/**
 * CLI entry point for server-side vehicle scraping:
 *   npm run vehicle -- vin=MMBJLKL10NH027545 headless=true
 */
async function main() {
  const args = process.argv.slice(2).reduce<Record<string, string>>((acc, arg) => {
    const eq = arg.indexOf("=");
    if (eq > 0) {
      acc[arg.slice(0, eq)] = arg.slice(eq + 1);
    } else {
      acc._ = arg;
    }
    return acc;
  }, {});

  const vin = args.vin || args._;
  if (!vin) {
    console.error("Usage: npm run vehicle -- vin=MMBJLKL10NH027545 [headless=true]");
    process.exit(1);
  }

  const env = getRnpEnvConfig();
  const result = await scrapeVehicleData(vin, {
    credentials:
      args.user && args.pass ? { user: args.user, pass: args.pass } : undefined,
    headless: args.headless !== "false",
    onLog: (line) => console.log(line),
  });

  console.log("\n=== RESULT ===");
  if (result.status === "success") {
    console.log(JSON.stringify(result.data, null, 2));
  } else {
    console.error(`Status: ${result.status}`);
    console.error(`Error: ${result.error}`);
    const envCredential = getFirstCredential();
    if (envCredential) {
      console.error("Credentials were loaded from env.");
    }
  }
  process.exit(result.status === "success" ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});