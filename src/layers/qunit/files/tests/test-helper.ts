import Application from '#app/app.ts';
import config from '#app/config.ts';
import * as QUnit from 'qunit';
import { setApplication } from '@ember/test-helpers';
import { setup } from 'qunit-dom';
import { start } from 'ember-qunit';

setApplication(Application.create(config));

setup(QUnit.assert);

start();
