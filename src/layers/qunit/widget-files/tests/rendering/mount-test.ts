import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";
import { click, settled } from "@ember/test-helpers";

import { mount } from "#src/index.ts";

/**
 * The widget renders in a shadow root,
 * so queries start at the root instead of the test container.
 */
function shadowOf(element: Element): Element {
  return element.shadowRoot as unknown as Element;
}

module("Rendering | mount", function (hooks) {
  setupRenderingTest(hooks);

  let element: HTMLElement;

  hooks.beforeEach(function () {
    element = document.createElement("div");
    document.querySelector("#ember-testing")!.appendChild(element);
  });

  test("renders with the default args", async function (assert) {
    mount(element);
    await settled();

    assert.dom("h2", shadowOf(element)).hasText("Count");
    assert.dom("output", shadowOf(element)).hasText("0");
  });

  test("counts clicks", async function (assert) {
    mount(element, { step: 2 });
    await settled();

    await click(shadowOf(element).querySelector("button")!);
    await click(shadowOf(element).querySelector("button")!);

    assert.dom("output", shadowOf(element)).hasText("4");
  });

  test("re-renders on update", async function (assert) {
    let widget = mount(element, { title: "Clicks" });
    await settled();

    widget.update({ title: "Taps", step: 3 });
    await settled();

    assert.dom("h2", shadowOf(element)).hasText("Taps");
    assert.dom("button", shadowOf(element)).hasText("+3");
  });

  test("removes the widget on destroy", async function (assert) {
    let widget = mount(element);
    await settled();

    widget.destroy();
    await settled();

    assert.strictEqual(element.shadowRoot?.childNodes.length, 0);
  });
});
