import type { Page } from "@playwright/test";

/** Fictional test-only credentials; the seed refuses to run outside a local database. */
export const E2E = {
  email: "e2e@bhd.local",
  password: "e2e-only-password",
  /** Employee with an ID number: the portal asks a new device to confirm it. */
  portalToken: "e2eportaltoken000000000000000001",
  /** Employee without ID or passport numbers: nothing to confirm, the portal opens directly. */
  openPortalToken: "e2eportaltoken000000000000000002",
};

export async function signIn(page: Page) {
  await page.goto("/login?local=1");
  await page.locator('input[name="email"]').fill(E2E.email);
  await page.locator('input[name="password"]').fill(E2E.password);
  await Promise.all([page.waitForURL((url) => !url.pathname.startsWith("/login")), page.locator('form button[type="submit"]').click()]);
}
