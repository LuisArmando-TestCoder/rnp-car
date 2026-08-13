import { scrapePropertyData } from "../src/lib/rnp";
import { getRnpEnvConfig } from "../src/lib/rnp/env";
import { getFirstCredential } from "../src/lib/rnp/credentials";

/**
 * CLI entry point for server-side scraping:
 *   npm run scrape -- finca=1-23456-000 province=1 headless=true
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

  const finca = args.finca || args._;
  if (!finca) {
    console.error("Usage: npm run scrape -- finca=1-23456-000 [province=1] [headless=true]");
    process.exit(1);
  }

  const env = getRnpEnvConfig();
  const result = await scrapePropertyData(finca, {
    province: args.province,
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