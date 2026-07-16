import { describe, it, expect } from "vitest";

import { hasInspectorSupport, wireInspectorSupport } from "#utils/inspector-support.js";

/**
 * The Application definition is found structurally, so every shape an app
 * author may have refactored their app file into gets wired the same way
 * the freshly generated shape does.
 */
describe("wireInspectorSupport", () => {
  it("wires the generated shape (export default class extends Application)", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class App extends Application {`,
      `  modules = {`,
      `    ...import.meta.glob("./router.*", { eager: true }),`,
      `  };`,
      `}`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.ts")).toMatchInlineSnapshot(`
      "import Application from "ember-strict-application-resolver";
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      export default class App extends Application {
        modules = { ...import.meta.glob("./router.*", { eager: true }) };
        inspector = setupInspector(this);
      }"
    `);
  });

  it("wires a named class exported in a separate statement", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `class App extends Application {`,
      `  modules = {};`,
      `}`,
      ``,
      `export default App;`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.js")).toMatchInlineSnapshot(`
      "import Application from "ember-strict-application-resolver";
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      class App extends Application {
        modules = {  };
        inspector = setupInspector(this);
      }
      export default App"
    `);
  });

  it("wires an anonymous default-exported class", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class extends Application {}`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.js")).toMatchInlineSnapshot(`
      "import Application from "ember-strict-application-resolver";
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      export default class extends Application {
        inspector = setupInspector(this);
      }"
    `);
  });

  it("wires a class expression assigned to a variable", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `const App = class extends Application {`,
      `  modules = {};`,
      `};`,
      ``,
      `export default App;`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.js")).toMatchInlineSnapshot(`
      "import Application from "ember-strict-application-resolver";
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      const App = class extends Application {
        modules = {  };
        inspector = setupInspector(this);
      };
      export default App"
    `);
  });

  it("wires a class extending @ember/application under a renamed import", () => {
    const code = [
      `import Base from "@ember/application";`,
      ``,
      `export default class App extends Base {}`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.ts")).toMatchInlineSnapshot(`
      "import Base from "@ember/application";
      import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";
      export default class App extends Base {
        inspector = setupInspector(this);
      }"
    `);
  });

  it("adds only the missing member when the import is already present", () => {
    const code = [
      `import wireUp from "@embroider/legacy-inspector-support/ember-source-4.12";`,
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class App extends Application {}`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.ts")).toMatchInlineSnapshot(`
      "import wireUp from "@embroider/legacy-inspector-support/ember-source-4.12";
      import Application from "ember-strict-application-resolver";
      export default class App extends Application {
        inspector = wireUp(this);
      }"
    `);
  });

  it("is idempotent", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class App extends Application {`,
      `  modules = {};`,
      `}`,
    ].join("\n");

    const once = wireInspectorSupport(code, "app/app.ts");
    const twice = wireInspectorSupport(once, "app/app.ts");

    expect(twice).toBe(once);
  });

  it("leaves a module without an Application definition alone", () => {
    const code = [`export function noApplicationHere() {}`, ``].join("\n");

    expect(wireInspectorSupport(code, "app/app.js")).toBe(code);
  });

  it("leaves a class that does not extend an Application import alone", () => {
    const code = [
      `import Component from "@glimmer/component";`,
      ``,
      `export default class App extends Component {}`,
    ].join("\n");

    expect(wireInspectorSupport(code, "app/app.ts")).toBe(code);
  });
});

describe("hasInspectorSupport", () => {
  it("is false before wiring and true after", () => {
    const code = [
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class App extends Application {}`,
    ].join("\n");

    expect(hasInspectorSupport(code, "app/app.ts")).toBe(false);
    expect(hasInspectorSupport(wireInspectorSupport(code, "app/app.ts"), "app/app.ts")).toBe(true);
  });

  it("is false when only the import is present", () => {
    const code = [
      `import setupInspector from "@embroider/legacy-inspector-support/ember-source-4.12";`,
      `import Application from "ember-strict-application-resolver";`,
      ``,
      `export default class App extends Application {}`,
    ].join("\n");

    expect(hasInspectorSupport(code, "app/app.ts")).toBe(false);
  });
});
