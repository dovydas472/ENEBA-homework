import { Skeleton } from "../../components/Skeleton.tsx";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import layout from "../checkout/CheckoutLayout.module.css";

/**
 * Placeholder of the order pages while they load (DESIGN.md 4.10): the panel with three bars, no "Loading…" on screen.
 * `label` is what screen readers hear ("Loading the order…").
 */
export function OrderLoading({ label }: { label: string }) {
  return (
    <div className={layout.page} aria-busy="true">
      <div className={layout.panel}>
        <VisuallyHidden>{label}</VisuallyHidden>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </div>
  );
}
