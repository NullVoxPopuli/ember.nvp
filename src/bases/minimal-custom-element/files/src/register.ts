import { CounterElement } from "./index.ts";

if (!customElements.get("minimal-custom-element")) {
  customElements.define("minimal-custom-element", CounterElement);
}
