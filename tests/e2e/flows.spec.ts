import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Acceptance flows from PRD 1.9. Sessions are established through the demo
 * login endpoint so each role gets its own cookie jar.
 */

async function signIn(context: BrowserContext, baseURL: string, role: string) {
  const response = await context.request.post(`${baseURL}/api/v1/auth/demo`, {
    data: { role },
  });
  expect(response.ok()).toBeTruthy();
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main#main")).toBeVisible();
}

test("search then book a slot", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signIn(context, baseURL!, "student");
  const page = await context.newPage();

  await open(page, "/equipment?q=edge+ai+kit");
  await expect(page.getByRole("heading", { name: "Equipment catalogue" })).toBeVisible();

  await page.getByRole("link", { name: /Jetson/i }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Pick a slot" })).toBeVisible();

  const firstSlot = page.getByRole("radio", { name: /free/i }).first();
  await firstSlot.check();
  await page.getByRole("button", { name: "Book this slot" }).click();

  await expect(page.getByText(/Booked:/)).toBeVisible();
  await open(page, "/bookings");
  await expect(page.getByText(/Jetson/i).first()).toBeVisible();
});

test("submit a request and approve it as faculty", async ({ browser, baseURL }) => {
  const student = await browser.newContext();
  await signIn(student, baseURL!, "student");
  const studentPage = await student.newPage();

  await open(studentPage, "/requests");
  await studentPage.getByLabel("Project title").fill("Hackathon rover demo");
  await studentPage.getByLabel("What are you building?").fill("A small rover for the demo.");
  await studentPage.getByLabel("Project deadline").fill("2030-01-10T10:00");
  await studentPage.getByLabel("Equipment").selectOption({ label: /Jetson/i });
  await studentPage.getByLabel("Hours needed").fill("2");
  await studentPage.getByLabel("Window starts").fill("2030-01-05T10:00");
  await studentPage.getByLabel("Window ends").fill("2030-01-05T14:00");
  await studentPage.getByLabel("Why do you need this?").fill("Profiling the vision pipeline.");
  await studentPage.getByRole("button", { name: "Submit request" }).click();
  await expect(studentPage.getByText(/Request submitted/)).toBeVisible();

  const faculty = await browser.newContext();
  await signIn(faculty, baseURL!, "faculty");
  const facultyPage = await faculty.newPage();
  await open(facultyPage, "/approvals");
  await expect(facultyPage.getByText("Hackathon rover demo")).toBeVisible();
});

test("conflict recommendation shows a fallback banner and options", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await signIn(context, baseURL!, "campus_admin");
  const page = await context.newPage();

  await open(page, "/conflicts");
  await page.getByRole("link", { name: /Open conflict/i }).first().click();
  await page.getByRole("button", { name: /Recommend allocations/i }).click();

  await expect(page.getByRole("heading", { name: "Ranked options" })).toBeVisible();
  await expect(page.getByText(/Fairness|fairness/).first()).toBeVisible();
});
