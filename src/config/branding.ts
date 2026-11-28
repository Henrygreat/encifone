import { z } from "zod";

const legacyName = "EncifOne";
const koraName = "Kora";
const text = (max: number) => z.string().trim().min(1).max(max);
const publicBrandSchema = z.object({
  name: text(48).optional(),
  tagline: text(140).optional(),
  parent: text(64).optional(),
  assistant: text(64).optional(),
  supportEmail: z.email().optional(),
  website: z.url({ protocol: /^https?$/ }).optional(),
  attribution: z.enum(["on", "off"]).default("off"),
});

export function resolveBranding(input: Record<string, string | undefined>) {
  const config = publicBrandSchema.parse(Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value?.trim() || undefined]),
  ));
  const productName = config.name?.toLowerCase() === "kora" ? koraName : config.name ?? legacyName;
  const isKora = productName === koraName;
  const isLegacy = productName === legacyName;
  const parentCompany = config.parent ?? (isKora ? "ENCIF" : null);
  const tagline = config.tagline ?? (isKora ? "Your intelligent business companion." : "One platform. Intelligent business.");
  const secondaryTagline = isLegacy ? "Acquire. Manage. Deliver. Automate. Grow." : "";
  const category = "AI-Powered Business Operating System";
  const assets = "/brand/kora";
  return {
    productName,
    shortProductName: productName,
    description: isKora ? `${tagline} ${category} for customers, sales, operations, finance and growth.` : `${tagline} ${secondaryTagline}`.trim(),
    tagline,
    secondaryTagline,
    category,
    wordmark: isKora ? "kora." : productName,
    parentCompany,
    attribution: parentCompany ? `A product by ${parentCompany}` : null,
    poweredBy: config.attribution === "on" ? `Powered by ${productName}` : null,
    supportEmail: config.supportEmail,
    marketingWebsite: config.website,
    copyrightHolder: parentCompany ?? productName,
    assistantName: config.assistant ?? (isLegacy ? "AI assistant" : `${productName} AI`),
    intelligenceName: isLegacy ? "Intelligence Core" : `${productName} Intelligence`,
    logos: isKora ? {
      primary: `${assets}/wordmark-dark.svg`,
      lightTheme: `${assets}/wordmark-light.svg`,
      darkTheme: `${assets}/wordmark-dark.svg`,
      compact: `${assets}/mark.svg`,
      monochrome: `${assets}/monochrome.svg`,
    } : null,
    favicon: isKora ? `${assets}/favicon.svg?v=1` : "/brand/encifone.ico",
    appleIcon: isKora ? `${assets}/apple-touch-icon.png?v=1` : null,
    pngIcon: isKora ? `${assets}/icon-512.png?v=1` : null,
    suite: {
      crm: `${productName} CRM`, sales: `${productName} Sales`, workspace: `${productName} Workspace`,
      finance: `${productName} Finance`, inbox: `${productName} Inbox`, growth: `${productName} Growth`,
      connect: `${productName} Connect`, intelligence: `${productName} Intelligence`,
    },
  } as const;
}

// Explicit references allow Next.js to inline these public build-time values.
export const branding = resolveBranding({
  name: process.env.NEXT_PUBLIC_PRODUCT_NAME,
  tagline: process.env.NEXT_PUBLIC_PRODUCT_TAGLINE,
  parent: process.env.NEXT_PUBLIC_PARENT_BRAND,
  assistant: process.env.NEXT_PUBLIC_AI_ASSISTANT_NAME,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  website: process.env.NEXT_PUBLIC_MARKETING_WEBSITE,
  attribution: process.env.NEXT_PUBLIC_PLATFORM_ATTRIBUTION,
});

const organisationBrand = z.object({
  companyName: text(120).optional().catch(undefined),
  logoUrl: z.url({ protocol: /^https$/ }).optional().catch(undefined),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional().catch(undefined),
  contactEmail: z.email().optional().catch(undefined),
  showPoweredBy: z.boolean().optional().catch(undefined),
});

export function resolvePortalBranding(name: string, stored: unknown) {
  const result = organisationBrand.safeParse(stored);
  const config = result.success ? result.data : undefined;
  return {
    name: config?.companyName ?? name,
    logoUrl: config?.logoUrl,
    accentColor: config?.accentColor,
    contactEmail: config?.contactEmail,
    attribution: config?.showPoweredBy === false ? null :
      config?.showPoweredBy === true ? `Powered by ${branding.productName}` : branding.poweredBy,
  };
}
