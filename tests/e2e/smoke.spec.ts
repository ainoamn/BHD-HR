import { expect, test } from "@playwright/test";
import { E2E, signIn } from "./fixtures";

test("protected pages send visitors to the login page", async ({ page }) => {
  await page.goto("/employees");
  await expect(page).toHaveURL(/\/login/);
});

test("the live endpoint never refreshes the session cookie", async ({ request }) => {
  const response = await request.get("/api/live");
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});

test("wrong passwords are refused", async ({ page }) => {
  await page.goto("/login?local=1");
  await page.locator('input[name="email"]').fill(E2E.email);
  await page.locator('input[name="password"]').fill("not-the-password");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/error=/);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("dashboard, employees and payroll open", async ({ page }) => {
    await page.goto("/employees");
    await expect(page.getByText("أحمد اختبار").first()).toBeVisible();
    await expect(page.getByText("سالم تجربة").first()).toBeVisible();
    await page.goto("/salaries");
    await expect(page.locator("main")).toBeVisible();
  });

  test("employee file and passport sticker render", async ({ page }) => {
    await page.goto("/employees?q=T-001");
    await page.getByText("أحمد اختبار").first().click();
    await expect(page).toHaveURL(/\/employees\/[^/]+$/);
    const id = new URL(page.url()).pathname.split("/").pop();
    await page.goto(`/employees/${id}/passport-sticker`);
    await expect(page.getByText("P1234567").first()).toBeVisible();
  });

  test("no page overflows a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/", "/employees", "/salaries", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });
});

test("the portal of an employee with nothing to confirm opens directly", async ({ page }) => {
  await page.goto(`/portal/${E2E.openPortalToken}`);
  await expect(page.getByText("سالم تجربة").first()).toBeVisible();
});
