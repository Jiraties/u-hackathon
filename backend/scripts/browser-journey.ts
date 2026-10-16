import assert from "node:assert/strict";
import type { Page } from "playwright";
export async function browserJourney({
  office,
  student,
  base,
  operatorId,
  studentId,
  rejectedId,
  password,
  round,
  capture = async () => {},
}: {
  office: Page;
  student: Page;
  base: string;
  operatorId: string;
  studentId: string;
  rejectedId: string;
  password: string;
  round: string;
  capture?: (page: Page, name: string) => Promise<void>;
}) {
  for (const page of [office, student])
    page.on("dialog", (dialog) => dialog.accept());
  await office.goto(base + "/university");
  await office.getByLabel("Operator ID").fill(operatorId);
  await office.getByLabel("Password", { exact: true }).fill(password);
  await office.getByRole("button", { name: "Sign in", exact: true }).click();
  await office
    .getByRole("button", { name: "Create rulebook", exact: true })
    .click();
  await office.getByLabel("Program slug").fill("browser-engineering");
  await office.getByLabel("Admission round").fill(round);
  await office.getByLabel("Program name").fill("Computer Engineering");
  await office.getByLabel("Degree (optional)").fill("Bachelor of Engineering");
  await office.getByRole("button", { name: "Save draft", exact: true }).click();
  await office
    .getByText("Draft saved. You can open it on another device.", {
      exact: true,
    })
    .waitFor();
  await office.reload();
  await office
    .getByRole("button", { name: "Edit rulebook", exact: true })
    .click();
  await capture(office, "builder");
  for (let i = 0; i < 3; i++)
    await office.getByRole("button", { name: "Continue", exact: true }).click();
  await office
    .getByRole("heading", { name: "Try a fictional calculation", exact: true })
    .waitFor();
  await capture(office, "builder-review");
  await office
    .getByRole("button", { name: "Publish on Avalanche", exact: true })
    .click();
  await office
    .getByRole("heading", { name: "Rules locked on chain", exact: true })
    .waitFor({ timeout: 180000 });
  await office
    .getByRole("button", { name: "All rulebooks", exact: false })
    .click();
  await capture(office, "office");
  await office
    .getByRole("button", { name: "Process admissions", exact: true })
    .click();
  await office
    .getByRole("checkbox", {
      name: `Computer Engineering · ${round}`,
      exact: true,
    })
    .check();
  await office
    .getByRole("button", { name: "Add fictional applicant", exact: true })
    .click();
  await office
    .getByLabel("Student account 1", { exact: true })
    .selectOption(studentId);
  await office.getByLabel("TGAT / 100", { exact: true }).fill("95");
  await office
    .getByRole("button", { name: "Add fictional applicant", exact: true })
    .click();
  await office
    .getByLabel("Student account 2", { exact: true })
    .selectOption(rejectedId);
  await office.getByLabel("TGAT / 100", { exact: true }).nth(1).fill("50");
  await office
    .getByRole("button", { name: "Preview allocation", exact: true })
    .click();
  await office
    .getByRole("button", { name: "Process and record results", exact: true })
    .click();
  await office
    .getByText("Results are saved and recorded.", { exact: false })
    .waitFor({ timeout: 180000 });
  await student.goto(base + "/student/wallet");
  await student.getByLabel("Student ID", { exact: true }).fill(studentId);
  await student.getByLabel("Password", { exact: true }).fill(password);
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await student
    .getByRole("heading", { name: "Admission offered", exact: true })
    .waitFor();
  await student
    .getByRole("button", { name: "Check result integrity", exact: true })
    .first()
    .click();
  await student
    .getByRole("heading", { name: "Your result record is verified", exact: true })
    .waitFor();
  await student.keyboard.press("Escape");
  await student
    .getByRole("button", { name: "Accept offer in FairPass", exact: true })
    .click();
  await student
    .getByText("Offer accepted in FairPass. Your university will complete the next steps.", {
      exact: true,
    })
    .waitFor();
  await office
    .getByRole("button", { name: "Issue admission tokens", exact: true })
    .click();
  await office
    .getByLabel("Issuance program")
    .selectOption({ label: `Computer Engineering · 2027 · ${round} · v1` });
  await office
    .getByRole("button", { name: "Refresh results", exact: true })
    .first()
    .click();
  await office.getByRole("checkbox", { name: `Select ${studentId}`, exact: true }).check();
  await office
    .getByRole("button", { name: "Review selected records", exact: true })
    .click();
  await office
    .getByRole("button", { name: "Issue 1 record", exact: true })
    .click();
  await office
    .getByText("Batch: 1 issued", { exact: false })
    .waitFor({ timeout: 180000 });
  await student.reload();
  await student
    .getByRole("heading", { name: "Your admission. Now a token.", exact: true })
    .waitFor();
  assert.equal(
    await student.locator(".result-drawer").getAttribute("open"),
    null,
  );
  await capture(student, "wallet");
  await student
    .getByRole("button", { name: "View token", exact: true })
    .click();
  await student
    .getByRole("dialog", { name: "Your admission token", exact: true })
    .waitFor();
  await student.keyboard.press("Escape");
  await student.getByRole("button", { name: "Share", exact: true }).click();
  const share = student.getByRole("dialog", {
    name: "Let someone check your token.",
    exact: true,
  });
  await share.waitFor();
  const link = await share.getByRole("textbox").inputValue();
  assert.match(link, /\/verify\/0x[0-9a-f]{64}$/);
  await student.getByRole("button", { name: "Copy link", exact: true }).click();
  await student.getByRole("status").waitFor();
  await student.keyboard.press("Escape");
  await student.getByRole("link", { name: "Verify", exact: true }).click();
  await student
    .getByRole("heading", { name: "Valid admission right", exact: true })
    .waitFor();
  const credentialId = new URL(student.url()).pathname.split("/").pop()!;
  await capture(student, "verification");
  await student
    .getByRole("link", {
      name: "See this program’s public capacity",
      exact: false,
    })
    .click();
  await student
    .getByRole("button", { name: "View registry events", exact: true })
    .click();
  await student.getByText("Admission token issued", { exact: true }).waitFor();
  await capture(student, "transparency");
  await student.goto(base + "/student/wallet");
  await student.getByRole("button", { name: "Sign out", exact: true }).click();
  await student
    .getByRole("heading", { name: "Sign in", exact: true })
    .waitFor();
  await capture(student, "login");
  await student.getByLabel("Student ID", { exact: true }).fill(rejectedId);
  await student.getByLabel("Password", { exact: true }).fill(password);
  await student.getByRole("button", { name: "Sign in", exact: true }).click();
  await student
    .getByRole("heading", { name: "Not admitted", exact: true })
    .waitFor();
  assert.equal(
    await student
      .getByRole("button", { name: "Accept offer in FairPass", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await student
      .getByRole("article", { name: "Your admission token", exact: true })
      .count(),
    0,
  );
  await capture(student, "non-admitted");
  return credentialId;
}
