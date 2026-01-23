interface Config {
  isTesting?: boolean;
  environment: string;
  modulePrefix: string;
  podModulePrefix?: string;
  locationType: "history" | "hash" | "none" | "auto";
  rootURL: string;
  EmberENV?: Record<string, unknown>;
  APP: Record<string, unknown> & { rootElement?: string; autoboot?: boolean };
}

const ENV: Config = {
  modulePrefix: "my-app-name",
  environment: import.meta.env.DEV ? "development" : "production",
  rootURL: "/",
  locationType: "history",
  EmberENV: {},
  APP: {},
};

export default ENV;
