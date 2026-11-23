# minimal-widget

An Ember component, packaged as a widget to embed in any page.
It is built with [`@nullvoxpopuli/ember-rolldown`](https://github.com/NullVoxPopuli/ember.nvp/tree/main/packages/rolldown)
and [tsdown](https://tsdown.dev/).

`dist/` contains ember and every other dependency. The page that uses the widget
needs nothing else.

`dist/` contains only the code that the widget imports.
The project is ES modules (`"type": "module"`), and ember marks its modules with side effects.
So the build leaves out each part of ember that the widget does not use.

## Usage

With a bundler, import `mount` and give it an element:

```js
import { mount } from "minimal-widget";

let widget = mount(document.querySelector("#widget"), { title: "Clicks", step: 2 });

widget.update({ step: 5 });
widget.destroy();
```

Without a bundler, load the global build with a `<script>` tag.
It defines `MinimalWidget` on `window`:

```html
<div id="widget"></div>

<script src="https://unpkg.com/minimal-widget/dist/index.iife.js"></script>
<script>
  MinimalWidget.mount(document.querySelector("#widget"), { title: "Clicks" });
</script>
```

Ember apps can import the `Widget` component directly from the package root.

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

- `src/widget.gts` is the root component of the widget.
- `src/mount.ts` renders the widget with `renderComponent` from `@ember/renderer`.
  It returns `update`, to change the args, and `destroy`, to remove the widget.
- `src/index.ts` is the public entry point.
  It exports `mount` and the component.
- `dist/` is the built output that gets published (git-ignored).

### Styles

The widget renders in a shadow root.
The styles of the host page do not apply to the widget,
and the styles of the widget do not apply to the host page.

Put the styles in the `<style>` element of `src/widget.gts`.

### Args

`mount` puts the args in a tracked object.
`update` writes to that object, so the DOM updates on the next render.

To add an arg:

1. Add it to the `Args` of `WidgetSignature`.
2. Give it a default value in `src/mount.ts`.
3. Read it as an arg in the component.

Declarations are emitted with [isolated declarations](https://www.typescriptlang.org/tsconfig/#isolatedDeclarations),
so every exported value needs an explicit type annotation.

### Development or production ember

The build bundles the production build of ember.

To bundle the development build (assertions and deprecation messages),
add the `development` condition in `tsdown.config.js`:

```js
inputOptions: { resolve: { conditionNames: ["development"] } },
```

## Publishing

`dist/` is built automatically on `prepack`,
so `npm publish` ships the compiled output plus your `src/`.
