import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";

export interface CounterSignature {
  Element: HTMLDivElement;
  Args: {
    label: string;
    step: number;
  };
}

export default class Counter extends Component<CounterSignature> {
  @tracked count = 0;

  increment = (): void => {
    this.count += this.args.step;
  };

  <template>
    <div ...attributes>
      <span class="label">{{@label}}</span>:
      <output>{{this.count}}</output>
      <button type="button" {{on "click" this.increment}}>+{{@step}}</button>
    </div>
  </template>
}
