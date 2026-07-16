import { module, test } from "qunit";

import { add } from "#src/utils/math.ts";

module("Unit | add", function () {
  test("adds two numbers", function (assert) {
    assert.strictEqual(add(1, 2), 3);
  });
});
