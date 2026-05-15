import { getOwner } from "@ember/owner";
import {
  currentRouteName,
  currentURL,
  getSettledState,
  resetOnerror,
  setApplication,
  visit,
} from "@ember/test-helpers";
import { getPendingWaiterState } from "@ember/test-waiters";
import * as QUnit from "qunit";
import { setup } from "qunit-dom";
import { setupEmberOnerrorValidation, start as qunitStart } from "ember-qunit";
import { setTesting } from "@embroider/macros";

import Application from "#app/app";
import config from "#config";

Object.assign(window, {
  visit,
  getSettledState,
  getPendingWaiterState,
  currentURL,
  currentRouteName,
  getOwner,
  snapshotTimers: (label?: string) => {
    console.debug(
      label ?? "snapshotTimers",
      JSON.parse(
        JSON.stringify({
          settled: getSettledState(),
          waiters: getPendingWaiterState(),
        }),
      ),
    );
  },
});

export function start() {
  config.locationType = "none";
  config.APP.rootElement = "#ember-testing";
  config.APP.autoboot = false;

  /**
   * Macros are in runtime mode for the test build (see babel.config.js),
   * so this is a real runtime call rather than a compile-time error.
   *
   * Caveats:
   * - https://github.com/embroider-build/embroider/issues/2660
   * - https://github.com/embroider-build/embroider/issues/1998
   */
  setTesting(true);

  setApplication(Application.create(config.APP));
  setup(QUnit.assert);
  setupEmberOnerrorValidation();

  QUnit.moduleStart(({ name }) => console.group(name));
  QUnit.testStart(({ name }) => console.group(name));
  QUnit.testDone(() => console.groupEnd());
  QUnit.moduleDone(() => console.groupEnd());
  QUnit.testDone(resetOnerror);

  qunitStart();
}
