import Application from "#app/app.ts";
import config from "#app/config.ts";
import { setApplication } from "@ember/test-helpers";

setApplication(Application.create(config));
