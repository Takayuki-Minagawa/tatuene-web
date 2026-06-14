import { describe, it, expect } from "vitest";
import { safeImageMime, imageExt } from "./store";

describe("画像MIMEの許可リスト検証", () => {
  it("許可されたMIMEはそのまま通す", () => {
    expect(safeImageMime("image/png")).toBe("image/png");
    expect(safeImageMime("image/jpeg")).toBe("image/jpeg");
    expect(safeImageMime("image/webp")).toBe("image/webp");
    expect(safeImageMime("image/svg+xml")).toBe("image/svg+xml");
  });

  it("未知・不正なMIMEは image/png にフォールバック", () => {
    expect(safeImageMime("text/html")).toBe("image/png");
    expect(safeImageMime("../../evil")).toBe("image/png");
    expect(safeImageMime(undefined)).toBe("image/png");
    expect(safeImageMime("")).toBe("image/png");
  });

  it("拡張子は安全な値に正規化される", () => {
    expect(imageExt("image/jpeg")).toBe("jpg");
    expect(imageExt("image/png")).toBe("png");
    expect(imageExt("application/x-msdownload")).toBe("png");
    expect(imageExt(undefined)).toBe("png");
  });
});
