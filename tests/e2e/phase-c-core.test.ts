import { expect, test } from "@playwright/test";

test.describe("Phase C Core Scenarios", () => {
  test("image-only submit sends file part without empty text", async ({
    page,
  }) => {
    await page.route("**/api/files/upload", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://example.com/fake-image.jpeg",
          pathname: "fake-image.jpeg",
          contentType: "image/jpeg",
        }),
      });
    });

    let capturedBody: any = null;
    await page.route("**/api/chat", async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "forced-test-error" }),
      });
    });

    await page.goto("/");

    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles({
      name: "sample.jpeg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([1, 2, 3, 4]),
    });

    await expect(page.getByTestId("attachments-preview")).toBeVisible();
    await expect(page.getByTestId("multimodal-input")).toHaveValue("");
    await expect(page.getByTestId("send-button")).toBeEnabled();

    await page.getByTestId("send-button").click();

    await expect
      .poll(() => capturedBody?.message?.parts?.length ?? 0)
      .toBeGreaterThan(0);

    const partTypes = (capturedBody.message.parts as Array<{ type: string }>).map(
      (part) => part.type
    );
    expect(partTypes.includes("file")).toBe(true);
    expect(partTypes.includes("text")).toBe(false);
  });

  test("shows upload error fallback message", async ({ page }) => {
    await page.route("**/api/files/upload", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Upload failed from test" }),
      });
    });

    await page.goto("/");

    const fileInput = page.locator("input[type='file']").first();
    await fileInput.setInputFiles({
      name: "sample.jpeg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([1, 2, 3, 4]),
    });

    await expect(page.getByText("Upload failed from test")).toBeVisible();
  });

  test("blob proxy validates request parameters", async ({ request }) => {
    const missingUrl = await request.get("/api/files/blob");
    expect(missingUrl.status()).toBe(400);

    const unsupportedHost = await request.get(
      `/api/files/blob?url=${encodeURIComponent("https://example.com/a.jpeg")}`
    );
    expect(unsupportedHost.status()).toBe(400);
  });
});
