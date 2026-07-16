import EmberRouter from "@ember/routing/router";
import { resetOnerror, setApplication } from "@ember/test-helpers";
import * as QUnit from "qunit";
import { setup } from "qunit-dom";
import { setupEmberOnerrorValidation, start as qunitStart } from "ember-qunit";
import { setTesting } from "@embroider/macros";
import EmberApp from "ember-strict-application-resolver";

class Router extends EmberRouter {
  location = "none";
  rootURL = "/";
}

Router.map(function () {});

class TestApp extends EmberApp {
  modules = {
    "./router": Router,
  };
}

export function start() {
  setTesting(true);
  setApplication(
    TestApp.create({
      autoboot: false,
      rootElement: "#ember-testing",
    }),
  );
  setup(QUnit.assert);
  setupEmberOnerrorValidation();

  QUnit.testDone(resetOnerror);

  qunitStart();
}
