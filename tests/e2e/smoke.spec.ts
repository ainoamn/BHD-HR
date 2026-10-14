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

test("an account name is locked after 8 wrong passwords", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.78.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const account = `nobody-${Date.now()}@bhd.local`;
  for (let i = 0; i < 9; i++) {
    await page.goto("/login?local=1");
    await page.locator('input[name="email"]').fill(account);
    await page.locator('input[name="password"]').fill("wrong");
    await Promise.all([page.waitForURL(/error=/), page.locator('form button[type="submit"]').click()]);
  }
  await expect(page.getByText("محاولات دخول خاطئة كثيرة").first()).toBeVisible();
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

  test("schedules, timesheet, import and system health open", async ({ page }) => {
    for (const [path, text] of [
      ["/settings/work", "جداول الدوام"],
      ["/attendance/timesheet", "تأخير وخروج مبكر"],
      ["/employees/import", "استيراد موظفين من ملف"],
      ["/settings/system", "النسخ الاحتياطي"],
    ]) {
      await page.goto(path);
      await expect(page.getByText(text).first(), path).toBeVisible();
    }
  });

  test("a signed-in staff member opens a portal without the device question", async ({ page }) => {
    await page.goto(`/portal/${E2E.portalToken}`);
    await expect(page).not.toHaveURL(/\/verify/);
    await expect(page.getByText("أحمد اختبار").first()).toBeVisible();
  });

  test("no page overflows a 360px screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/", "/employees", "/salaries", "/settings", "/settings/work", "/attendance/timesheet", "/employees/import", "/settings/system"]) {
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

test("a new device must confirm the last 4 ID digits, then is remembered", async ({ page }) => {
  await page.goto(`/portal/${E2E.portalToken}`);
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByText("أحمد اختبار")).toHaveCount(0);
  await page.locator('input[name="answer"]').fill("9999");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/error=/);
  await page.locator('input[name="answer"]').fill("1234");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/portal/${E2E.portalToken}$`));
  await expect(page.getByText("أحمد اختبار").first()).toBeVisible();
  await page.goto(`/portal/${E2E.portalToken}`);
  await expect(page).not.toHaveURL(/\/verify/);
});

test("an address that keeps guessing links is refused even the real one", async ({ request }) => {
  const headers = { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const real = await request.get(`/portal/${E2E.openPortalToken}`, { headers });
  expect(await real.text()).toContain("سالم تجربة");
  for (let i = 0; i < 31; i++) await request.get(`/portal/guess${String(i).padStart(24, "0")}`, { headers });
  const blocked = await request.get(`/portal/${E2E.openPortalToken}`, { headers });
  expect(await blocked.text()).not.toContain("سالم تجربة");
});
