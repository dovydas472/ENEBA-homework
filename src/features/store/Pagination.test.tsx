// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test-utils.tsx";
import { Pagination } from "./Pagination.tsx";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function renderPagination(page: number, totalPages: number, onPageChange = vi.fn()) {
  const view = render(<Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />);
  cleanup = view.unmount;
  const buttons = [...view.container.querySelectorAll("button")];
  return {
    ...view,
    onPageChange,
    /** The items in order: "Previous page", "1", "2", "…", "Next page" (the arrows have no text: their accessible name is used). */
    items: [...view.container.querySelectorAll("li")].map(
      (li) => li.textContent?.trim() || li.querySelector("button")?.getAttribute("aria-label"),
    ),
    prev: buttons.find((b) => b.getAttribute("aria-label") === "Previous page")!,
    next: buttons.find((b) => b.getAttribute("aria-label") === "Next page")!,
    pageButton: (n: number) => buttons.find((b) => b.getAttribute("aria-label") === `Page ${n}`)!,
  };
}

describe("Pagination", () => {
  it("draws nothing for a single page", () => {
    const { container } = renderPagination(1, 1);
    expect(container.querySelector("nav")).toBeNull();
  });

  it("shows every page number when there are few pages", () => {
    const { items } = renderPagination(1, 5);
    expect(items).toEqual(["Previous page", "1", "2", "3", "4", "5", "Next page"]);
  });

  it("first page of many: first pages, ellipsis, last page", () => {
    expect(renderPagination(1, 10).items).toEqual(["Previous page", "1", "2", "3", "4", "5", "…", "10", "Next page"]);
  });

  it("middle page: ellipsis on both sides", () => {
    expect(renderPagination(5, 10).items).toEqual(["Previous page", "1", "…", "4", "5", "6", "…", "10", "Next page"]);
  });

  it("last page of many: first page, ellipsis, last pages", () => {
    expect(renderPagination(10, 10).items).toEqual(["Previous page", "1", "…", "6", "7", "8", "9", "10", "Next page"]);
  });

  it("disables the previous arrow on the first page and the next arrow on the last page", () => {
    const first = renderPagination(1, 5);
    expect(first.prev.disabled).toBe(true);
    expect(first.next.disabled).toBe(false);
    cleanup?.();

    const last = renderPagination(5, 5);
    expect(last.prev.disabled).toBe(false);
    expect(last.next.disabled).toBe(true);
    cleanup?.();

    const middle = renderPagination(3, 5);
    expect(middle.prev.disabled).toBe(false);
    expect(middle.next.disabled).toBe(false);
  });

  it("marks the current page with aria-current and no other", () => {
    const { container } = renderPagination(3, 5);
    const current = container.querySelectorAll("[aria-current=page]");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("3");
  });

  it("asks for the right page when a number or an arrow is clicked", () => {
    const { onPageChange, prev, next, pageButton } = renderPagination(3, 5);
    act(() => pageButton(5).click());
    act(() => prev.click());
    act(() => next.click());
    expect(onPageChange.mock.calls).toEqual([[5], [2], [4]]);
  });

  it("hides the ellipsis from screen readers", () => {
    const { container } = renderPagination(5, 10);
    const gaps = [...container.querySelectorAll("li")].filter((li) => li.textContent === "…");
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.getAttribute("aria-hidden")).toBe("true");
  });
});
