import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import { Badge } from "#src/components/badge.gts";

module("Rendering | Badge", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders its content", async function (assert) {
    await render(
      <template>
        <Badge>New</Badge>
      </template>,
    );

    assert.dom("span.badge").hasText("New");
  });
});
