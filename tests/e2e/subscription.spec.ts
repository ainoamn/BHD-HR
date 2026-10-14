import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

const noOverflow = async (page: Page, path: string) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, path).toBeLessThanOrEqual(1);
};

test("visitors get the landing page at / and can read the prices", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#pricing").getByText("الاحترافية").first()).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByText("مقارنة الباقات")).toBeVisible();
});

test("public pages fit a 360px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/", "/pricing"]) {
    await page.goto(path);
    await noOverflow(page, path);
  }
});

test("the platform admin area is closed to visitors", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  const csv = await page.request.get("/admin/companies/export", { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(csv.status());
});

test.describe("platform admin and plans", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("a signed-in user gets the dashboard at /, not the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#pricing")).toHaveCount(0);
  });

  test("every admin page and the billing page open and fit 360px", async ({ page }) => {
    const pages: [string, string][] = [
      ["/admin", "نظرة عامة"],
      ["/admin/companies", "شركة الاختبار"],
      ["/admin/payments", "المدفوعات"],
      ["/admin/plans", "الباقات"],
      ["/admin/users", "e2e@bhd.local"],
      ["/admin/settings", "إعدادات المنصة"],
      ["/admin/log", "سجل الإدارة"],
      ["/admin/search?q=e2e", "e2e@bhd.local"],
      ["/billing", "الاشتراك والباقة"],
    ];
    for (const [path, text] of pages) {
      await page.goto(path);
      await expect(page.getByText(text).first(), path).toBeVisible();
    }
    await page.setViewportSize({ width: 360, height: 800 });
    for (const [path] of pages) {
      await page.goto(path);
      await noOverflow(page, path);
    }
  });

  test("the admin console searches, filters and exports companies", async ({ page }) => {
    await page.goto(`/admin/search?q=${encodeURIComponent("الاختبار")}`);
    await expect(page.getByRole("link", { name: "شركة الاختبار" }).first()).toBeVisible();
    await page.goto("/admin/companies?sort=name");
    await expect(page.getByRole("link", { name: "شركة الاختبار" }).first()).toBeVisible();
    await page.goto("/admin/companies?state=SUSPENDED");
    await expect(page.getByText("لا توجد نتائج")).toBeVisible();
    const csv = await page.request.get("/admin/companies/export");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain("شركة الاختبار");
    await page.goto("/admin/users?kind=admins");
    await expect(page.getByText("e2e@bhd.local").first()).toBeVisible();
    await page.goto("/admin/log?group=subscription");
    await expect(page.getByText("سجل الإدارة").first()).toBeVisible();
  });

  test("a plan's employee limit stops new employees", async ({ page }) => {
    const setPlan = async (plan: string, maxEmployees: string) => {
      await page.goto("/admin/companies");
      await page.getByRole("link", { name: "شركة الاختبار" }).first().click();
      await page.getByRole("button", { name: "تغيير الباقة" }).click();
      const dialog = page.locator("dialog[open]");
      await dialog.locator('select[name="planId"]').selectOption({ label: plan });
      await dialog.locator('select[name="status"]').selectOption("ACTIVE");
      await dialog.locator('input[name="noEnd"]').check();
      await dialog.locator('input[name="maxEmployees"]').fill(maxEmployees);
      await dialog.locator('button[type="submit"]').click();
      await expect(page.getByText("تم حفظ اشتراك الشركة")).toBeVisible();
    };

    await setPlan("الأساسية", "2");
    await page.goto("/employees/new");
    await page.locator('input[name="fullName"]').fill("موظف زائد");
    await page.locator('input[name="nameEn"]').fill("Extra Person");
    const sponsor = page.locator('input[name="newEmployerName"]');
    if (await sponsor.isVisible()) await sponsor.fill("كفيل الاختبار");
    await page.getByRole("button", { name: "حفظ الموظف" }).click();
    await expect(page.getByText("وصلت باقتك إلى حدها من الموظفين").first()).toBeVisible();

    await setPlan("الأعمال", "");
    await page.goto("/billing");
    await expect(page.getByText("الأعمال").first()).toBeVisible();
  });

  test("the free plan is offered but refused while the company is over its limits", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("مجاناً دائماً").first()).toBeVisible();
    await page.goto("/billing");
    await expect(page.getByText("مجاناً دائماً").first()).toBeVisible();
    await page.getByRole("button", { name: "انتقل إلى المجانية" }).click();
    const dialog = page.locator("dialog[open]");
    if (await dialog.isVisible()) await dialog.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText(/تسمح بـ 2 موظف ولديك/).first()).toBeVisible();
  });
});
