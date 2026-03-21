import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatDigestAsHtml } from "./format-html.js";
import * as fs from "fs/promises";

vi.mock("fs/promises");

describe("formatDigestAsHtml", () => {
  const fakeTemplate = "<!DOCTYPE html><html><body>template</body></html>";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(fs.readFile).mockResolvedValue(fakeTemplate);
  });

  it("should return the html template contents", async () => {
    const html = await formatDigestAsHtml();
    expect(html).toBe(fakeTemplate);
  });

  it("should read from html-template.html", async () => {
    await formatDigestAsHtml();
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining("html-template.html"),
      "utf-8",
    );
  });
});
