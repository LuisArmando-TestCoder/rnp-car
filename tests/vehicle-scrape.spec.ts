import { test, expect } from "@playwright/test";
import { scrapeVehicleData } from "../src/lib/rnp";

const TEST_VIN = "MMBJLKL10NH027545";

test.describe("RNP Digital Vehicle Scrape", () => {
  test("scrapes vehicle data by VIN using LLM extraction", async () => {
    test.setTimeout(120000);

    const result = await scrapeVehicleData(TEST_VIN, {
      headless: true,
      timeoutMs: 60000,
    });

    // Log error details for debugging
    if (result.status !== "success") {
      console.log("SCRAPE ERROR:", result.error);
      console.log("LOGS:", result.logs.join("\n"));
    }

    // Should succeed
    expect(result.status).toBe("success");
    expect(result.data).toBeDefined();

    const data = result.data!;

    // Vehicle identity
    expect(data.plate).toContain("CL 330873");
    expect(data.general.marca).toContain("MITSUBISHI");
    expect(data.general.estilo).toContain("L200");
    expect(data.general.vin).toContain(TEST_VIN);
    expect(data.general.chasis).toContain(TEST_VIN);

    // Engine
    expect(data.engine.numeroMotor).toBeTruthy();
    expect(data.engine.combustible).toContain("DIESEL");

    // Registration
    expect(data.registration.tomo).toBeTruthy();
    expect(data.registration.asiento).toBeTruthy();

    // Owners
    expect(data.owners.length).toBeGreaterThan(0);
    expect(data.owners[0].nombre).toContain("INTERBREMACR");

    // Flags (this vehicle has none)
    expect(data.flags.gravamenes).toBe(false);
    expect(data.flags.anotaciones).toBe(false);
    expect(data.flags.infracciones).toBe(false);
    expect(data.flags.levantamientos).toBe(false);

    // Metadata
    expect(data.scrapedAt).toBeTruthy();
    expect(data.rawText.length).toBeGreaterThan(100);
  });

  test("returns error for invalid VIN", async () => {
    test.setTimeout(120000);

    const result = await scrapeVehicleData("INVALIDVIN123", {
      headless: true,
      timeoutMs: 60000,
    });

    // Should either be not_found or error, but not success
    expect(result.status).not.toBe("success");
  });
});