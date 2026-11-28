import Image from "next/image";
import { branding } from "@/config/branding";

export function ProductMark() {
  if (branding.logos) {
    return <Image src={branding.logos.compact} alt="" width={28} height={28} className="size-7 shrink-0" unoptimized />;
  }
  return (
    <span aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
      style={{ background: "linear-gradient(135deg, var(--module-sales), var(--module-intelligence))" }}>
      {branding.shortProductName[0]}
    </span>
  );
}

export function ProductSignature() {
  if (!branding.logos && !branding.attribution) return null;
  return (
    <div className="mb-2 space-y-1">
      {branding.logos ? (
        <span className="block">
          <Image src={branding.logos.darkTheme} alt={branding.productName} width={114} height={38}
            className="block [.professional-light_&]:hidden" unoptimized />
          <Image src={branding.logos.lightTheme} alt={branding.productName} width={114} height={38}
            className="hidden [.professional-light_&]:block" unoptimized />
        </span>
      ) : <p className="font-semibold">{branding.productName}</p>}
      <p className="text-sm text-muted-foreground">{branding.tagline}</p>
      {branding.attribution && <p className="text-xs text-muted-foreground">{branding.attribution}</p>}
    </div>
  );
}
