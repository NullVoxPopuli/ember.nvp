import { describe, test, expect } from "vitest";
import { setupRenderingContext } from "ember-vitest";

import { Badge } from "../../src/index.ts";

describe("Badge", () => {
  test("renders its block", async () => {
    using ctx = await setupRenderingContext();

    await ctx.render(
      <template>
        <Badge>New</Badge>
      </template>,
    );

    expect(ctx.find(".badge")?.textContent).toBe("New");
  });
});
