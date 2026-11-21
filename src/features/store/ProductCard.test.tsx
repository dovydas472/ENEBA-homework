// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test-utils.tsx";
import { makeItem } from "./fixtures.ts";
import { ProductCard } from "./ProductCard.tsx";
import type { ProductItem } from "../../api/types.ts";

vi.mock("../../api/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.ts")>()),
  apiFetch: vi.fn(async () => ({})),
}));

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function renderCard(item: ProductItem, queryClient = new QueryClient()) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProductCard item={item} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  cleanup = view.unmount;
  return { ...view, link: view.container.querySelector("a")! };
}

describe("ProductCard", () => {
  it("is one link to the product page", () => {
    const { container, link } = renderCard(makeItem());
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(link.getAttribute("href")).toBe("/product/the-witcher-3-wild-hunt-steam-global");
  });

  it("shows title, platform and region as text", () => {
    const { link } = renderCard(makeItem());
    expect(link.querySelector("h3")?.textContent).toBe("The Witcher 3: Wild Hunt");
    expect(link.textContent).toContain("Steam");
    expect(link.textContent).toContain("Global");
  });

  it("shows 'From', the price, the struck-through MSRP and the discount", () => {
    const { link } = renderCard(makeItem({ priceCents: 1199, msrpCents: 2999, discountPercent: 60 }));
    expect(link.textContent).toContain("From");
    expect(link.textContent).toContain("€11.99");
    expect(link.querySelector("s")?.textContent).toContain("€29.99");
    expect(link.textContent).toContain("-60%");
  });

  it("hides the edition for 'Standard' and shows any other edition", () => {
    const standard = renderCard(makeItem({ edition: "Standard" }));
    expect(standard.link.textContent).not.toContain("Standard");
    cleanup?.();

    const special = renderCard(makeItem({ edition: "Game of the Year Edition" }));
    expect(special.link.textContent).toContain("Game of the Year Edition");
  });

  it("shows the discount badge only when discountPercent is above 0", () => {
    const none = renderCard(makeItem({ discountPercent: null }));
    expect(none.link.textContent).not.toContain("%");
    cleanup?.();

    const zero = renderCard(makeItem({ discountPercent: 0 }));
    expect(zero.link.textContent).not.toContain("%");
    cleanup?.();

    const some = renderCard(makeItem({ discountPercent: 5 }));
    expect(some.link.textContent).toContain("-5%");
  });

  it("shows no struck-through price when the MSRP is unknown", () => {
    const { link } = renderCard(makeItem({ msrpCents: null, discountPercent: null }));
    expect(link.querySelector("s")).toBeNull();
    expect(link.textContent).toContain("€10.99");
  });

  it("out of stock: no price, an 'Out of stock' label, and the card is still a link", () => {
    const { link } = renderCard(makeItem({ inStock: false, priceCents: null, discountPercent: null }));
    expect(link.textContent).toContain("Out of stock");
    expect(link.textContent).not.toContain("€");
    expect(link.textContent).not.toContain("From");
    expect(link.className).toContain("unavailable"); // the dimmed style
  });

  it("an in-stock card is not dimmed", () => {
    const { link } = renderCard(makeItem());
    expect(link.className).not.toContain("unavailable");
  });

  describe("cover", () => {
    it("loads the image lazily and without alt text (the title next to it names the game)", () => {
      const { container } = renderCard(makeItem());
      const img = container.querySelector("img")!;
      expect(img.getAttribute("src")).toBe("https://images.example/witcher.jpg");
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(img.getAttribute("alt")).toBe("");
    });

    it("shows a placeholder with the title when there is no cover", () => {
      const { container } = renderCard(makeItem({ coverUrl: null }));
      expect(container.querySelector("img")).toBeNull();
      // The placeholder repeats the title, but is hidden from screen readers (the h3 already says it).
      const placeholder = container.querySelector("[aria-hidden=true]")!;
      expect(placeholder.textContent).toBe("The Witcher 3: Wild Hunt");
    });

    it("replaces the image with the placeholder when it fails to load (onError)", () => {
      const { container } = renderCard(makeItem());
      const img = container.querySelector("img")!;
      act(() => {
        img.dispatchEvent(new Event("error"));
      });
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[aria-hidden=true]")?.textContent).toBe("The Witcher 3: Wild Hunt");
    });
  });

  describe("prefetch (S13)", () => {
    it("prefetches the product on hover, once while the data is fresh", async () => {
      const { apiFetch } = await import("../../api/client.ts");
      vi.mocked(apiFetch).mockClear();
      // staleTime > 0 like the app's client: a second hover must not ask again.
      const { link } = renderCard(makeItem(), new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));

      await act(async () => {
        link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });
      await act(async () => {
        link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
        link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      });

      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/products/the-witcher-3-wild-hunt-steam-global");
    });

    it("prefetches on keyboard focus too", async () => {
      const { apiFetch } = await import("../../api/client.ts");
      vi.mocked(apiFetch).mockClear();
      const { link } = renderCard(makeItem());
      await act(async () => link.focus());
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });
  });
});
