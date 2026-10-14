import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

/** A Ministry of Labour style export: a title row above the headers, the ministry's column names, one worker already on file. */
const SHEET = [
  "قائمة العمال المسجلين",
  "م,اسم العامل,الرقم المدني,الجنسية,المهنة,رقم ترخيص العمل,تاريخ انتهاء الترخيص,اسم صاحب العمل,السجل التجاري",
  "1,عامل مستورد,70001111,Bangladesh,عامل نظافة,WP-E2E-1,31/12/2027,مؤسسة الاختبار للتجارة,1112223",
  "2,أحمد اختبار,90001234,India,فني,WP-E2E-2,30/06/2028,,",
  "3,سالم تجربة,,OM,,,,,",
].join("\n");

test.describe("bulk add", () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test("an exported ministry sheet adds new workers, opens the sponsor and flags the one on file", async ({ page }) => {
    await page.goto("/employees/import");
    await expect(page.getByText("ملفات العمال من وزارة العمل (PDF)")).toBeVisible();
    await page.locator('input[name="file"]').setInputFiles({ name: "mol-workers.csv", mimeType: "text/csv", buffer: Buffer.from(SHEET, "utf8") });
    await page.getByRole("button", { name: "فحص الملف" }).click();
    await expect(page.getByText("1 موظف جديد")).toBeVisible();
    await expect(page.getByText("2 موجود مسبقاً")).toBeVisible();
    await expect(page.getByText("مؤسسة الاختبار للتجارة")).toBeVisible();
    await expect(page.getByRole("link", { name: /أحمد اختبار \(T-001\)/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /سالم تجربة \(T-002\)/ })).toBeVisible();

    await page.getByLabel(/تحديث بيانات الموظفين الموجودين/).check();
    await page.getByRole("button", { name: "حفظ 3 موظفاً" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "تأكيد" }).click();

    await expect(page).toHaveURL(/\/employees\/complete\?since=/);
    await expect(page.getByText(/أُضيف 1 موظفاً وحُدّثت بيانات 2، وفُتح 1 كفيل جديد/)).toBeVisible();
    await expect(page.getByRole("link", { name: "عامل مستورد" })).toBeVisible();

    await page.getByRole("link", { name: "عامل مستورد" }).click();
    await expect(page.getByText("مؤسسة الاختبار للتجارة").first()).toBeVisible();
    await page.goto(`${page.url().split("?")[0]}?tab=docs`);
    await expect(page.getByText("WP-E2E-1").first()).toBeVisible();

    await page.goto("/employees/import");
    await page.locator('input[name="file"]').setInputFiles({ name: "again.csv", mimeType: "text/csv", buffer: Buffer.from(SHEET, "utf8") });
    await page.getByRole("button", { name: "فحص الملف" }).click();
    await expect(page.getByText("3 موجود مسبقاً")).toBeVisible();
  });

  test("the completion banner lists what an employee's file lacks", async ({ page }) => {
    await page.goto("/employees/complete");
    const row = page.locator("li").filter({ hasText: "سالم تجربة" });
    await expect(row.getByText("تاريخ الميلاد")).toBeVisible();
    await row.getByRole("link", { name: "أكمل" }).click();
    await expect(page).toHaveURL(/complete=1/);
    await expect(page.getByText("أكمل البيانات الناقصة لهذا الموظف:")).toBeVisible();
  });
});
