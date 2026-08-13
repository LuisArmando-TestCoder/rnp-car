import { config } from "dotenv";
config();
import { chromium } from "playwright";
import { performSecureLogin } from "../src/lib/rnp";
import { getFirstCredential } from "../src/lib/rnp/credentials";

const LOGIN = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const VEH = "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaVehiculo.jspx";

async function main() {
  const cred = getFirstCredential();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(LOGIN, { waitUntil: "domcontentloaded" });
  if (cred) await performSecureLogin(page, cred.user, cred.pass);
  await page.goto(VEH, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const selects = page.locator("select");
  const n = await selects.count();
  console.log("SELECT COUNT:", n);
  for (let i = 0; i < n; i++) {
    const opts = await selects.nth(i).locator("option").allTextContents();
    const id = await selects.nth(i).getAttribute("id");
    const name = await selects.nth(i).getAttribute("name");
    console.log(`\nSelect ${i}: id=${id} name=${name}`);
    console.log("  Options:", JSON.stringify(opts));
  }

  const inputs = page.locator("input");
  const ic = await inputs.count();
  console.log("\nINPUT COUNT:", ic);
  for (let i = 0; i < ic; i++) {
    const t = await inputs.nth(i).getAttribute("type");
    const nm = await inputs.nth(i).getAttribute("name");
    const id = await inputs.nth(i).getAttribute("id");
    console.log(`Input ${i}: type=${t} name=${nm} id=${id}`);
  }

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
