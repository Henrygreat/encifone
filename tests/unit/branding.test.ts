import { describe, expect, it } from "vitest";
import { resolveBranding, resolvePortalBranding } from "@/config/branding";

describe("platform branding", () => {
  it("keeps the live identity by default for a reversible rollout", () => {
    expect(resolveBranding({ name: "", tagline: "" })).toMatchObject({
      productName: "EncifOne", logos: null, poweredBy: null, favicon: "/brand/encifone.ico",
    });
  });

  it("selects Kora assets and suite names only for the Kora identity", () => {
    const brand = resolveBranding({ name: "kora", attribution: "on" });
    expect(brand).toMatchObject({
      productName: "Kora", wordmark: "kora.", poweredBy: "Powered by Kora",
      attribution: "A product by ENCIF", assistantName: "Kora AI", intelligenceName: "Kora Intelligence",
      suite: { growth: "Kora Growth" }, logos: { compact: "/brand/kora/mark.svg" },
    });
    expect(resolveBranding({ name: "New Name" })).toMatchObject({ productName: "New Name", logos: null, suite: { growth: "New Name Growth" } });
  });

  it("honours valid organisation settings and discards unsafe values individually", () => {
    const identity = resolvePortalBranding("Organisation", {
      companyName: "Example Studio", logoUrl: "javascript:alert(1)", accentColor: "#2dd4bf", showPoweredBy: false,
    });
    expect(identity).toMatchObject({ name: "Example Studio", logoUrl: undefined, accentColor: "#2dd4bf", attribution: null });
    expect(resolvePortalBranding("Organisation", null).name).toBe("Organisation");
  });
});
