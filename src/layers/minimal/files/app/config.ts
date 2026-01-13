const ENV = {
  modulePrefix: '__PROJECT_NAME__',
  environment: import.meta.env.DEV ? 'development' : 'production',
  rootURL: '/',
  locationType: 'history',
  EmberENV: {},
  APP: {},
} as {
  environment: string;
  modulePrefix: string;
  podModulePrefix?: string;
  rootURL: string;
  locationType: 'history' | 'hash';
  EmberENV: Record<string, unknown>;
  APP: Record<string, unknown>;
};

export default ENV;
