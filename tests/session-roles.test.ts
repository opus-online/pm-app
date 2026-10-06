import { describe, it, expect } from "vitest";
import { pickMainRole } from "@/lib/auth/roles";

describe("pickMainRole", () => {
  it("ignores the sales add-on regardless of order", () => {
    expect(pickMainRole(["sales", "admin"])).toBe("admin");
    expect(pickMainRole(["admin", "sales"])).toBe("admin");
  });
  it("returns null when only add-ons exist", () => {
    expect(pickMainRole(["sales"])).toBeNull();
    expect(pickMainRole([])).toBeNull();
  });
});
