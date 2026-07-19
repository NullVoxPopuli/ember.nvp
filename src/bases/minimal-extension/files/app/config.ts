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
  /**
   * Extension pages live at chrome-extension://<id>/index.html (or
   * moz-extension://), where history-based routing has nothing to bind
   * to. "none" keeps routing fully programmatic.
   */
  locationType: "none",
  EmberENV: {},
  APP: {},
};

export default ENV;
