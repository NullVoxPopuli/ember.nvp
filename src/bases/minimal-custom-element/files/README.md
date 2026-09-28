# minimal-custom-element

An Ember component, packaged as a
[custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
and built with
[`@nullvoxpopuli/ember-rolldown`](https://github.com/NullVoxPopuli/ember.nvp/tree/main/packages/rolldown)
and [tsdown](https://tsdown.dev/).

`dist/` contains ember and every other dependency. The page that uses the element
needs nothing else.

## Usage

Import the `register` entry once. It defines the `<minimal-custom-element>` tag.

```js
import "minimal-custom-element/register";
```

```html
<minimal-custom-element label="Clicks" step="2"></minimal-custom-element>
```

To choose your own tag name, import the class and define it yourself:

```js
import { CounterElement } from "minimal-custom-element";

customElements.define("my-counter", CounterElement);
```

Ember apps can import the `Counter` component directly from the package root.

## Development

```bash
pnpm install
```

Build the distributable (JS + `.d.ts` into `dist/`):

```bash
pnpm build
```

Rebuild on change while developing:

```bash
pnpm start
```

## Structure

- `src/components/counter.gts` is the Ember component.
- `src/element.ts` is the custom element.
  Its `connectedCallback` renders the component with `renderComponent` from `@ember/renderer`.
  Its `disconnectedCallback` destroys that render.
- `src/register.ts` defines the tag.
  Consumers import this file for its side effect.
- `src/index.ts` is the public entry point.
  It exports the element class and the component.
- `dist/` is the built output that gets published (git-ignored).

### Reactive attributes

The element lists its attributes in `observedAttributes`.
Each attribute change writes to a tracked object.
The component reads its args from that object, so the DOM updates on the next render.

To add an attribute:

1. Add its name to `observedAttributes`.
2. Give it a default value in the tracked object.
3. Write the new value in `attributeChangedCallback`.
4. Read it as an arg in the component.

Declarations are emitted with
[isolated declarations](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations),
so every exported value needs an explicit type annotation.

### Development or production ember

The build bundles the production build of ember.

To bundle the development build (assertions and deprecation messages),
add the `development` condition in `tsdown.config.js`:

```js
inputOptions: { resolve: { conditionNames: ["development"] } },
```

## Publishing

`dist/` is built automatically on `prepack`, so `npm publish` ships the
compiled output plus your `src/`.
