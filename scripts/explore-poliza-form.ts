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

  // Go to the vehicle form page and look for links to the pólizas form
  await page.goto(VEH, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Dump all links on the page
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map((a) => ({
      text: (a.textContent || "").trim().slice(0, 80),
      href: a.getAttribute("href") || "",
    }))
  );
  console.log("LINKS ON VEHICLE FORM PAGE:");
  links.forEach((l) => console.log(`  "${l.text}" -> ${l.href}`));

  // Look for a pólizas link
  const polizaLink = links.find((l) => /p[oó]liza/i.test(l.text + " " + l.href));
  if (polizaLink) {
    console.log("\nFOUND PÓLIZAS LINK:", JSON.stringify(polizaLink));
    const url = new URL(polizaLink.href, VEH).href;
    console.log("Navigating to:", url);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/rejected|support id/i.test(body)) {
      console.log("\nWAF BLOCKED. Body snippet:", body.slice(0, 300));
    } else {
      console.log("\nPÓLIZAS FORM PAGE URL:", page.url());
      console.log("BODY (first 2000 chars):", body.slice(0, 2000).replace(/\n/g, " | "));

      const selects = page.locator("select");
      const n = await selects.count();
      console.log("\nSELECT COUNT:", n);
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
        const ph = await inputs.nth(i).getAttribute("placeholder");
        console.log(`Input ${i}: type=${t} name=${nm} id=${id} placeholder=${ph}`);
      }
    }
  } else {
    console.log("\nNo pólizas link found on vehicle form page.");
    // Try common URL patterns
    const candidates = [
      "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaPoliza.jspx",
      "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaPolizas.jspx",
      "https://www.rnpdigital.com/shopping/consultaDocumentos/consultaPoliza.jspx",
      "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaPolizaVehicular.jspx",
    ];
    for (const url of candidates) {
      console.log("\nTrying:", url);
      await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2500);
      const b = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      if (/rejected|support id/i.test(b)) {
        console.log("  WAF BLOCKED");
      } else if (/p[oó]liza/i.test(b)) {
        console.log("  FOUND PÓLIZAS FORM at:", page.url());
        console.log("  BODY (first 1500):", b.slice(0, 1500).replace(/\n/g, " | "));
        const selects = page.locator("select");
        const n = await selects.count();
        console.log("  SELECT COUNT:", n);
        for (let i = 0; i < n; i++) {
          const opts = await selects.nth(i).locator("option").allTextContents();
          const id = await selects.nth(i).getAttribute("id");
          const name = await selects.nth(i).getAttribute("name");
          console.log(`  Select ${i}: id=${id} name=${name} options=${JSON.stringify(opts)}`);
        }
        const inputs = page.locator("input");
        const ic = await inputs.count();
        console.log("  INPUT COUNT:", ic);
        for (let i = 0; i < ic; i++) {
          const t = await inputs.nth(i).getAttribute("type");
          const nm = await inputs.nth(i).getAttribute("name");
          const id = await inputs.nth(i).getAttribute("id");
          const ph = await inputs.nth(i).getAttribute("placeholder");
          console.log(`  Input ${i}: type=${t} name=${nm} id=${id} placeholder=${ph}`);
        }
        break;
      } else {
        console.log("  Not a pólizas form. URL:", page.url(), "Body:", b.slice(0, 200).replace(/\n/g, " | "));
      }
    }
  }

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });