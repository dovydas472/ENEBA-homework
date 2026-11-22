import type { Variant } from "../../api/types.ts";

/** "Steam · GLOBAL" or "Steam · GLOBAL · Game of the Year Edition" (the edition only when it is not "Standard"). */
export function variantName(variant: Pick<Variant, "platform" | "region" | "edition">): string {
  const parts = [variant.platform.name, variant.region.name];
  if (variant.edition !== "Standard") parts.push(variant.edition);
  return parts.join(" · ");
}
