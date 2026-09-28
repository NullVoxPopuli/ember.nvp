import { renderComponent } from "@ember/renderer";
import { trackedObject } from "@ember/reactive/collections";

import Counter from "./components/counter.gts";

/**
 * Every element renders through one shared owner.
 *
 * ember keeps one renderer per owner,
 * so this is one renderer for the whole library instead of one per element.
 */
const owner = {};

export class CounterElement extends HTMLElement {
  static observedAttributes: string[] = ["label", "step"];

  /**
   * The rendered component reads its args from this object.
   *
   * A write to a property here re-renders the component.
   */
  #args = trackedObject({ label: "Count", step: 1 });

  #rendered: ReturnType<typeof renderComponent> | undefined;

  connectedCallback(): void {
    this.#rendered = renderComponent(Counter, { into: this, owner, args: this.#args });
  }

  disconnectedCallback(): void {
    this.#rendered?.destroy();
    this.#rendered = undefined;
  }

  attributeChangedCallback(name: string, _previous: string | null, value: string | null): void {
    switch (name) {
      case "label":
        this.#args.label = value ?? "Count";
        break;
      case "step":
        this.#args.step = Number(value ?? 1);
        break;
    }
  }
}
