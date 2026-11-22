// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test-utils.tsx";
import { SortRadios } from "./SortRadios.tsx";
import { sortOptions } from "./sortLabels.ts";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mount(value: Parameters<typeof SortRadios>[0]["value"], onChange = vi.fn(), options = sortOptions(false)) {
  const view = render(<SortRadios value={value} options={options} onChange={onChange} />);
  cleanup = view.unmount;
  const radios = [...view.container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
  return { radios, onChange, group: view.container.querySelector("[role=radiogroup]")! };
}

describe("SortRadios", () => {
  it("is a named radio group with one radio per sort, in the API order", () => {
    const { radios, group } = mount("popularity");
    expect(group.getAttribute("aria-label")).toBe("Sort by");
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
      "Most popular",
      "Price: low to high",
      "Price: high to low",
      "Biggest discount",
      "Newest",
      "Name A–Z",
    ]);
    // One shared name = one group (arrow keys move between them).
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
  });

  it("checks the current sort", () => {
    const { radios } = mount("newest");
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(["newest"]);
  });

  it("asks for the clicked sort", () => {
    const { radios, onChange } = mount("popularity");
    act(() => radios.find((r) => r.value === "price_asc")!.click());
    expect(onChange).toHaveBeenCalledWith("price_asc");
  });

  it("offers 'Best match' first when the options include it (a search is active)", () => {
    const { radios } = mount("relevance", vi.fn(), sortOptions(true));
    expect(radios.map((r) => r.value)).toEqual(["relevance", "popularity", "price_asc", "price_desc", "discount", "newest", "title"]);
    expect(radios[0].closest("label")?.textContent).toBe("Best match");
    expect(radios[0].checked).toBe(true);
  });
});
