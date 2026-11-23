import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";

export interface WidgetSignature {
  Args: {
    title: string;
    step: number;
  };
}

export default class Widget extends Component<WidgetSignature> {
  @tracked count = 0;

  increment = (): void => {
    this.count += this.args.step;
  };

  <template>
    {{!
      The widget renders in a shadow root.
      These styles apply only to the widget,
      and the styles of the host page do not apply here.
    }}
    <style>
      :host {
        display: block;
        font-family: system-ui, sans-serif;
      }

      .widget {
        display: inline-flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.5rem 1rem;
        border: 1px solid #ccc;
        border-radius: 0.5rem;
      }

      h2 {
        margin: 0;
        font-size: 1rem;
      }
    </style>

    <section class="widget">
      <h2>{{@title}}</h2>
      <output>{{this.count}}</output>
      <button type="button" {{on "click" this.increment}}>+{{@step}}</button>
    </section>
  </template>
}
