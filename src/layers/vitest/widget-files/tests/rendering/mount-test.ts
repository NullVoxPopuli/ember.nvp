import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { renderSettled } from "@ember/renderer";

import { mount } from "../../src/index.ts";

let element: HTMLElement;

beforeEach(() => {
  element = document.createElement("div");
  document.body.appendChild(element);
});

afterEach(() => {
  element.remove();
});

/**
 * The widget renders in a shadow root,
 * so queries start at the root instead of the document.
 */
function query(selector: string) {
  return element.shadowRoot?.querySelector(selector);
}

describe("mount", () => {
  test("renders with the default args", async () => {
    mount(element);
    await renderSettled();

    expect(query("h2")?.textContent).toBe("Count");
    expect(query("output")?.textContent).toBe("0");
  });

  test("counts clicks", async () => {
    mount(element, { step: 2 });
    await renderSettled();

    (query("button") as HTMLButtonElement).click();
    await renderSettled();
    (query("button") as HTMLButtonElement).click();
    await renderSettled();

    expect(query("output")?.textContent).toBe("4");
  });

  test("re-renders on update", async () => {
    let widget = mount(element, { title: "Clicks" });
    await renderSettled();

    widget.update({ title: "Taps", step: 3 });
    await renderSettled();

    expect(query("h2")?.textContent).toBe("Taps");
    expect(query("button")?.textContent).toBe("+3");
  });

  test("keeps the styles of the host page out", async () => {
    let style = document.createElement("style");

    style.textContent = "h2 { color: rgb(255, 0, 0); }";
    document.head.appendChild(style);

    mount(element);
    await renderSettled();

    expect(getComputedStyle(query("h2")!).color).not.toBe("rgb(255, 0, 0)");

    style.remove();
  });

  test("removes the widget on destroy", async () => {
    let widget = mount(element);
    await renderSettled();

    widget.destroy();
    await renderSettled();

    expect(element.shadowRoot?.childNodes).toHaveLength(0);
  });
});
