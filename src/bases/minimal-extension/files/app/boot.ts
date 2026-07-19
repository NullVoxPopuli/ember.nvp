/**
 * Extension pages disallow inline scripts (`script-src 'self'`),
 * so booting the app lives here instead of in index.html.
 */
import Application from "#app/app";
import environment from "#config";

Application.create(environment.APP);
