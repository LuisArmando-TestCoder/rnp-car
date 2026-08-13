/**
 * Loads & parses RNP credentials for the scraper pipeline.
 *
 * Priority:
 *   1. `RNP_CREDENTIALS` — composite: "user1:pass1~user2:pass2"
 *   2. `RNP_USERNAME` + `RNP_PASSWORD` (legacy fallback)
 */

export interface CredentialPair {
  user: string;
  pass: string;
}

export function getConfiguredCredentials(): CredentialPair[] {
  const rawCredentials = process.env.RNP_CREDENTIALS || "";

  if (rawCredentials) {
    const pairs: CredentialPair[] = [];
    const segments = rawCredentials.split("~");

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

  // Legacy fallback
  const users = (process.env.RNP_USERNAME || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const passes = (process.env.RNP_PASSWORD || "").split(",").map((p) => p.trim());
  const pairs: CredentialPair[] = [];
  users.forEach((user, i) => {
    const pass = passes[i] || passes[passes.length - 1];
    if (user && pass) pairs.push({ user, pass });
  });

  return pairs;
}

/** Returns the first configured credential (default account). */
export function getFirstCredential(): CredentialPair | null {
  return getConfiguredCredentials()[0] || null;
}

export function hasConfiguredCredentials(): boolean {
  return getConfiguredCredentials().length > 0;
}