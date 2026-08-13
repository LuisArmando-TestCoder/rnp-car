import { config } from "dotenv";

// Load .env when running outside the Next.js runtime (e.g. tsx CLI scripts)
config();

export interface RnpEnvConfig {
  rnpUrl: string;
  rnpCredentials?: RnpCredentialPair[];
}

export interface RnpCredentialPair {
  user: string;
  pass: string;
}

/**
 * Parses the composite RNP_CREDENTIALS env var:
 *   RNP_CREDENTIALS="user1:pass1~user2:pass2"
 */
export function parseRnpCredentials(): RnpCredentialPair[] {
  const raw = process.env.RNP_CREDENTIALS || "";

  if (raw) {
    const pairs: RnpCredentialPair[] = [];
    const segments = raw.split("~");

    for (const segment of segments) {
      if (!segment.includes(":")) continue;
      const [user, ...passParts] = segment.split(":");
      const pass = passParts.join(":");

      if (user && pass) {
        pairs.push({ user: user.trim(), pass: pass.trim() });
      }
    }

    if (pairs.length > 0) return pairs;
  }

  // Legacy fallback: single account
  const users = (process.env.RNP_USERNAME || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const passes = (process.env.RNP_PASSWORD || "").split(",").map((p) => p.trim());

  const pairs: RnpCredentialPair[] = [];
  users.forEach((user, i) => {
    const pass = passes[i] || passes[passes.length - 1];
    if (user && pass) pairs.push({ user, pass });
  });

  return pairs;
}

export function getRnpEnvConfig(): RnpEnvConfig {
  return {
    rnpUrl: process.env.RNP_URL || "https://www.rnpdigital.com/shopping/login.jspx",
    rnpCredentials: parseRnpCredentials(),
  };
}