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

import Application from "#app/app";
import config, { enterTestMode } from "#config";

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
  enterTestMode();

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
