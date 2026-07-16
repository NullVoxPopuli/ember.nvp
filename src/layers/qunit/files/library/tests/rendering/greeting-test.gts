import { render } from "@ember/test-helpers";
import { module, test } from "qunit";
import { setupRenderingTest } from "ember-qunit";

import Greeting from "#src/components/greeting.gts";

module("Rendering | Greeting", function (hooks) {
  setupRenderingTest(hooks);

  test("it renders", async function (assert) {
    await render(<template><Greeting @name="Tomster" /></template>);

    assert.dom("p").hasText("Hello, Tomster!");
  });
});
