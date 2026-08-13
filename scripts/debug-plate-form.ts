import { config } from "dotenv";
config();
import { chromium } from "playwright";
import { performSecureLogin } from "../src/lib/rnp";
import { getFirstCredential } from "../src/lib/rnp/credentials";

const LOGIN = process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx";
const VEH = "https://www.rnpdigital.com/shopping/consultaDocumentos/paramConsultaVehiculo.jspx";

async function main() {
  const cred = getFirstCredential();
  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();

  await page.goto(LOGIN, { waitUntil: "domcontentloaded" });
  if (cred) {
    const ok = await performSecureLogin(page, cred.user, cred.pass);
    console.log("LOGIN OK:", ok);
  }

  await page.goto(VEH, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Dump the full form structure BEFORE filling anything
  const dump = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input[type='text']")).map((el: any, i) => ({
      i, id: el.id || "", name: el.name || "", placeholder: el.placeholder || "", value: el.value || "",
    }));
    const selects = Array.from(document.querySelectorAll("select")).map((el: any, i) => ({
      i, id: el.id || "", name: el.name || "", value: el.value || "",
      options: Array.from(el.options).map((o: any) => o.text.trim()),
    }));
    const labels = Array.from(document.querySelectorAll("label")).map((l: any) => l.innerText?.trim() || "");
    const tableText = Array.from(document.querySelectorAll("table")).map((t: any) => t.innerText?.slice(0, 500) || "");
    return { inputs, selects, labels, tableText };
  });
  console.log("FORM DUMP:", JSON.stringify(dump, null, 2));

  // Select "Número de Placa" in the first select
  const selects = page.locator("select");
  const sc = await selects.count();
  console.log("SELECT COUNT:", sc);
  for (let i = 0; i < sc; i++) {
    const opts = await selects.nth(i).locator("option").allTextContents();
    const idx = opts.findIndex((t) => /placa/i.test(t));
    if (idx >= 0) {
      console.log(`Select ${i} -> Placa (index ${idx})`);
      await selects.nth(i).selectOption({ index: idx });
      break;
    }
  }
  await page.waitForTimeout(800);

  // Fill plate number (last text input) and code class
  const textInputs = page.locator("input[type='text']");
  const tc = await textInputs.count();
  console.log("TEXT INPUT COUNT:", tc);
  for (let i = 0; i < tc; i++) {
    const id = await textInputs.nth(i).getAttribute("id");
    const name = await textInputs.nth(i).getAttribute("name");
    const ph = await textInputs.nth(i).getAttribute("placeholder");
    console.log(`TextInput ${i}: id=${id} name=${name} placeholder=${ph}`);
  }

  // Fill the LAST text input with the plate number
  await textInputs.last().fill("330873");
  await page.waitForTimeout(400);

  // Try to fill code class: look for a labeled input or first input
  const codeInput = page.locator(
    "input[type='text'][id*='clase' i], input[type='text'][name*='clase' i], input[type='text'][placeholder*='clase' i], input[type='text'][placeholder*='c[oó]digo' i]"
  ).first();
  if ((await codeInput.count()) > 0) {
    console.log("Filling code class into labeled input");
    await codeInput.fill("CL");
  } else {
    console.log("No labeled code input found; filling first text input");
    await textInputs.first().fill("CL");
  }
  await page.waitForTimeout(400);

  // Click Consultar
  const btn = page.locator("img[src*='btn-consultar' i]").first();
  console.log("Consultar button count:", await btn.count());
  await btn.click({ force: true }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(5000);

  console.log("POST-SUBMIT URL:", page.url());
  const body = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  console.log("POST-SUBMIT TEXT (first 800):", body.slice(0, 800).replace(/\n/g, " | "));

  // Keep the browser open for manual inspection
  console.log("BROWSER LEFT OPEN - inspect the form, then close the window.");
  await new Promise((r) => setTimeout(r, 300000));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
