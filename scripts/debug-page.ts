import { chromium } from "playwright";
import { config } from "dotenv";
import { getFirstCredential } from "../src/lib/rnp/credentials";
config();

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Login
  await page.goto("https://www.rnpdigital.com/shopping/login.jspx", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Fill login form
  const envCredential = getFirstCredential();
  const user = envCredential?.user;
  const pass = envCredential?.pass;
  if (!user || !pass) throw new Error("Missing credentials");

  const inputs = await page.locator("input[type='text'], input[type='password'], input:not([type])").all();
  console.log("Login inputs found:", inputs.length);
  for (const input of inputs) {
    const type = await input.getAttribute("type");
    const name = await input.getAttribute("name");
    const id = await input.getAttribute("id");
    console.log(`  input type=${type} name=${name} id=${id}`);
  }

  // Fill first text input with user, first password with pass
  const textInputs = page.locator("input[type='text'], input:not([type])");
  const passInputs = page.locator("input[type='password']");
  if ((await textInputs.count()) > 0) await textInputs.first().fill(user);
  if ((await passInputs.count()) > 0) await passInputs.first().fill(pass);

  // Find submit button
  const submit = page.locator("input[type='submit'], button[type='submit'], input[value*='Ingresar' i], input[value*='Entrar' i], a:has-text('Ingresar'), a:has-text('Entrar')");
  console.log("Submit candidates:", await submit.count());
  await submit.first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(5000);

  console.log("After login URL:", page.url());

  // Navigate to consulta
  await page.goto("https://www.rnpdigital.com/shopping/consultaFinca.jspx", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  console.log("Consulta URL:", page.url());

  // Dump all forms and inputs
  const forms = await page.locator("form").all();
  console.log("\n=== FORMS:", forms.length, "===");
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const id = await form.getAttribute("id");
    const name = await form.getAttribute("name");
    const action = await form.getAttribute("action");
    console.log(`\nForm ${i}: id=${id} name=${name} action=${action}`);
    const inputs = await form.locator("input, select, textarea").all();
    for (const input of inputs) {
      const tag = await input.evaluate((el) => el.tagName);
      const id = await input.getAttribute("id");
      const name = await input.getAttribute("name");
      const type = await input.getAttribute("type");
      const value = await input.getAttribute("value");
      console.log(`  ${tag} id=${id} name=${name} type=${type} value=${value}`);
    }
  }

  // Also dump any element with id containing "params" or "finca"
  console.log("\n=== Elements with 'params' or 'finca' in id ===");
  const matches = await page.locator("[id*='params' i], [id*='finca' i], [name*='params' i], [name*='finca' i]").all();
  for (const el of matches) {
    const tag = await el.evaluate((e) => e.tagName);
    const id = await el.getAttribute("id");
    const name = await el.getAttribute("name");
    console.log(`  ${tag} id=${id} name=${name}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});