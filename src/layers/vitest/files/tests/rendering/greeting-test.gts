import { describe, test, expect } from "vitest";
import { setupRenderingContext } from "ember-vitest";

import { Greeting } from "../../src/index.ts";

describe("Greeting", () => {
  test("greets by name", async () => {
    using ctx = await setupRenderingContext();

    await ctx.render(<template><Greeting @name="World" /></template>);

    expect(ctx.element.textContent).toContain("Hello, World!");
  });
});
