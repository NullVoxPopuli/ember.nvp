import Component from "@glimmer/component";

export interface GreetingSignature {
  Element: HTMLParagraphElement;
  Args: {
    name: string;
  };
}

export default class Greeting extends Component<GreetingSignature> {
  <template>
    <p ...attributes>Hello, {{@name}}!</p>
  </template>
}
