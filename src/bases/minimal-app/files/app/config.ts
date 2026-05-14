interface Config {
  environment: "development" | "production";
  locationType: "history" | "hash" | "none" | "auto";
  rootURL: string;
  EmberENV?: Record<string, unknown>;
  APP: Record<string, unknown> & { rootElement?: string; autoboot?: boolean };
}

const ENV: Config = {
  environment: import.meta.env.DEV ? "development" : "production",
  rootURL: "/",
  locationType: "history",
  EmberENV: {},
  APP: {},
};

export default ENV;

import { setTesting } from "@embroider/macros";

export function enterTestMode() {
  ENV.locationType = "none";
  ENV.APP.rootElement = "#ember-testing";
  ENV.APP.autoboot = false;

  setTesting(true);
}
