// @vitest-environment jsdom
// The visual states are checked by eye; this file tests the one piece of LOGIC in Button:
// a loading button ignores clicks (so a double click cannot submit twice).
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../test-utils.tsx";
import { Button } from "./Button.tsx";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function mount(ui: React.ReactNode) {
  const view = render(ui);
  cleanup = view.unmount;
  return view.container.querySelector("button")!;
}

const click = (button: HTMLButtonElement) => act(() => button.click());

describe("Button", () => {
  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    click(mount(<Button onClick={onClick}>Buy</Button>));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ignores clicks while loading and is marked aria-busy", () => {
    const onClick = vi.fn();
    const button = mount(
      <Button loading onClick={onClick}>
        Buy
      </Button>,
    );
    click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("stays focusable while loading (it is not the disabled attribute)", () => {
    const button = mount(<Button loading>Buy</Button>);
    expect(button.disabled).toBe(false);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    click(
      mount(
        <Button disabled onClick={onClick}>
          Buy
        </Button>,
      ),
    );
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is type=button by default, so it never submits a form by accident", () => {
    expect(mount(<Button>Buy</Button>).type).toBe("button");
  });
});
