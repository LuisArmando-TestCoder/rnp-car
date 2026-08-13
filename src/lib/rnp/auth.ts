import { Page } from "playwright";
import { logger } from "./logger";

const LOGIN_URL = "https://www.rnpdigital.com/shopping/login.jspx";

/**
 * Performs a secure login to the RNP Digital portal.
 * Returns true if the page transitions past the login screen.
 */
export async function performSecureLogin(
  page: Page,
  user: string,
  pass: string,
  timeoutMs: number = 20000
): Promise<boolean> {
  logger.info("AUTH", "Performing secure login to RNP Digital");

  try {
    // Wait for any standard login form field (username input has autocomplete hints in RNP)
    await page.waitForSelector('input[type="text"], input[name*="user" i], input[name*="login" i], input[id*="user" i], input[name*="email" i], input[id*="email" i]', {
      timeout: timeoutMs,
    });
    logger.debug("AUTH", "Login form located");

    // Dump all text inputs + labels for debugging
    const formDebug = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el: any) => ({
        tag: el.tagName,
        id: el.id || "",
        name: el.name || "",
        type: el.type || "",
      }));
      const bodyText = document.body?.innerText?.slice(0, 800) || "";
      return { inputs, bodyText };
    });
    logger.debug("AUTH", "Login form fields", { fields: formDebug.inputs });

    // The RNP login form uses JSF-generated IDs/PREFIX that changes on every
    // page load (e.g. "jida06adf", "jidc7b25c"). The stable part is the NAME
    // suffix "correo", "pass" and the button "j_id26". Select by attribute
    // suffix so it works regardless of the random prefix.
    //   [name$=":correo"]  → Correo electrónico (email)
    //   [name$=":pass"]    → Contraseña (password)
    //   [name$=":j_id26"]  → "Ingresar" button (type=button, not submit)
    const userField = page.locator('[name$=":correo"]').first();
    const passField = page.locator('[name$=":pass"]').first();
    const loginBtn = page.locator('[name$=":j_id26"]').first();

    const userCount = await userField.count();
    const passCount = await passField.count();
    logger.debug("AUTH", `Login form fields located: user=${userCount > 0}, pass=${passCount > 0}`);

    if (userCount === 0 || passCount === 0) {
      logger.warn("AUTH", "Could not locate credential fields — dumping page text");
      const text = await page.evaluate(() => document.body?.innerText || "");
      logger.warn("AUTH", `PAGE TEXT:\n${text.slice(0, 2000)}`);
      return false;
    }

    // Fill user + password on the exact RNP login fields
    await userField.fill(user);
    await page.waitForTimeout(300);
    await passField.fill(pass);
    await page.waitForTimeout(300);

    logger.debug("AUTH", "Credentials filled, submitting...");

    // Click the EXACT "Ingresar" login button (type=button).
    // Clicking a generic submit can trigger OTHER forms on the page
    // (e.g. the modal "Registro" form) and misdirect the login.
    const btnCount = await loginBtn.count();
    if (btnCount > 0) {
      await loginBtn.click({ force: true });
    } else {
      await passField.press("Enter");
    }

    logger.debug("AUTH", "Login submitted, awaiting post-auth navigation");
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

    // RNP shows a modal when there's an active session for the same user:
    //   "Ya existe una sesión activa para este usuario. ¿Desea cancelar esa
    //    sesión y crear una nueva?"
    // The modal is typically a JSF dialog (formModalSesion) with two buttons.
    // We confirm (cancel old session + create new) by clicking a matching
    // submit inside that modal. Loop briefly in case the modal appears a
    // moment after submit.
    for (let attempt = 0; attempt < 3; attempt++) {
      const modalText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
      const modalVisible = /sesi[oó]n activa|cancelar esa sesi[oó]n|crear una nueva/i.test(modalText);
      if (modalVisible) {
        // formModalSesion has two submits: j_id34 (confirm/cancel old session)
        // and j_id35 (dismiss). Click the FIRST one.
        const modalBtn = page.locator(
          "input[name*='formModalSesion' i][type='submit'], input[type='submit'][name^='formModalSesion']"
        ).first();
        const modalCount = await modalBtn.count().catch(() => 0);
        if (modalCount > 0) {
          logger.info("AUTH", "Active-session modal detected — confirming to cancel old session & create new");
          await modalBtn.click({ force: true });
          await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          break;
        }
      }
      await page.waitForTimeout(500);
    }

    // If the page is a REGISTRATION form (we got redirected to registro.jspx),
    // that means login FAILED — the credentials were not accepted.
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes("registro") || currentUrl.includes("register")) {
      const text = await page.evaluate(() => document.body?.innerText || "");
      logger.warn("AUTH", "Redirected to REGISTRATION page — login FAILED");
      logger.warn("AUTH", `Register page text:\n${text.slice(0, 1500)}`);
      return false;
    }

    // Verify we actually moved past login. RNP keeps the URL as login.jspx even
    // after authenticating (the content swaps to the dashboard). So detect auth
    // by checking for dashboard markers: the "Desconectar" (logout) link, the
    // "Carrito de Compras" (shopping cart) heading, or #params:finca search form.
    await page.waitForFunction(
      () => {
        const text = (document.body?.innerText || "").toLowerCase();
        const hasLogout =
          !!document.querySelector("a[href*='logout' i], a[href*='salir' i], img[alt*='Salir' i]") ||
          text.includes("desconectar") ||
          text.includes("salir");
        const hasCart = text.includes("carrito de compras");
        const hasSearch = !!document.querySelector("#params\\:finca");
        return hasLogout || hasCart || hasSearch;
      },
      { timeout: timeoutMs }
    );

    logger.info("AUTH", "Login successful — URL: " + page.url());
    return true;
  } catch (err) {
    logger.warn("AUTH", "Login verification failed or timed out", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Dump final page text for debugging
    try {
      const text = await page.evaluate(() => document.body?.innerText || "");
      logger.warn("AUTH", `Final page text:\n${text.slice(0, 1500)}`);
    } catch {}
    return false;
  }
}

/**
 * Safely logs out of the RNP session to prevent zombie-session account locks.
 */
export async function safeLogout(page: Page) {
  try {
    logger.info("AUTH", "Attempting safe logout");
    const logoutLink = page.locator(
      "a[href*='logout' i], a[href*='salir' i], img[alt*='Salir' i], a:has-text('Salir')"
    ).first();
    if ((await logoutLink.count()) > 0) {
      await logoutLink.click({ force: true });
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
      logger.info("AUTH", "Logout completed");
    } else {
      logger.debug("AUTH", "No logout link found; skipping");
    }
  } catch (err) {
    logger.warn("AUTH", "Logout failed (non-critical)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}