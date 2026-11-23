import { renderComponent } from "@ember/renderer";
import { trackedObject } from "@ember/reactive/collections";

import Widget, { type WidgetSignature } from "./widget.gts";

export type WidgetArgs = WidgetSignature["Args"];

export interface MountedWidget {
  /**
   * Changes some or all of the args.
   *
   * The widget re-renders with the new values.
   */
  update(args: Partial<WidgetArgs>): void;

  /**
   * Removes the widget from the page.
   */
  destroy(): void;
}

const defaults: WidgetArgs = { title: "Count", step: 1 };

/**
 * Every widget renders through one shared owner.
 *
 * ember keeps one renderer per owner,
 * so this is one renderer for the whole page instead of one per widget.
 */
const owner = {};

/**
 * Renders the widget into `element`, inside a shadow root.
 *
 * The shadow root keeps the styles of the host page and of the widget apart.
 */
export function mount(element: Element, args: Partial<WidgetArgs> = {}): MountedWidget {
  let state = trackedObject(Object.assign({}, defaults, args));

  let root = element.shadowRoot ?? element.attachShadow({ mode: "open" });
  let container = document.createElement("div");

  root.appendChild(container);

  let rendered = renderComponent(Widget, { into: container, owner, args: state });

  return {
    update(next) {
      Object.assign(state, next);
    },
    destroy() {
      rendered.destroy();
      container.remove();
    },
  };
}
