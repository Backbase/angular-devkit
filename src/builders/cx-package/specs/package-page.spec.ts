import { Architect } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing';
import { logging, schema } from '@angular-devkit/core';

import * as path from 'path';
import { CxPackageBuilderOptions } from '../schema';
import { promisify } from 'util';
import { expectZipContents, rootDir, cxPackageBuilderName } from './test-utils';

const rimraf = promisify(require('rimraf'));

/**
 * Path to the dir containing test assets.
 */
const testDir = path.resolve(
  rootDir,
  'test',
  'builders',
  'cx-package',
  'page-builder'
);

describe('cx-package builder with page item', () => {
  let architect: Architect;
  let architectHost: TestingArchitectHost;

  beforeEach(async () => {
    await rimraf(path.resolve(testDir, 'dist'));

    const registry = new schema.CoreSchemaRegistry();
    registry.addPostTransform(schema.transforms.addUndefinedDefaults);

    // TestingArchitectHost() takes workspace and current directories.
    architectHost = new TestingArchitectHost(testDir, testDir);
    architect = new Architect(architectHost, registry);

    // addBuilderFromPackage takes either a Node package name, or a path
    // to a directory containing a package.json file.
    await architectHost.addBuilderFromPackage(rootDir);
  });

  it('should correctly package the page', async () => {
    const options: CxPackageBuilderOptions = {
      items: [
        {
          type: 'page',
          name: 'test-page',
          entryFile: 'resources/index.hbs',
          icon: 'resources/icon.png',
          builtSources: 'build',
          modelXml: 'resources/model.xml',
        },
      ],
      destFileName: 'my-awesome-package.zip',
      skipCleanUp: true,
    };

    const logger = new logging.Logger('');
    const infoLogs = [];
    logger.subscribe((ev) => {
      if (ev.level === 'info') {
        infoLogs.push(ev.message);
      }
    });

    // A "run" can have multiple outputs, and contains progress information.
    const run = await architect.scheduleBuilder(
      cxPackageBuilderName,
      <any>options,
      { logger }
    );

    // The "result" member (of type BuilderOutput) is the next output.
    const output = await run.result;

    // Stop the builder from running. This stops Architect from keeping
    // the builder-associated states in memory, since builders keep waiting
    // to be scheduled.
    await run.stop();

    expect(output.success).toBe(true);

    const expectedOutputPath = path.resolve(
      testDir,
      'dist',
      'provisioning-packages',
      options.destFileName
    );

    expect(infoLogs).toContain(
      `Created provisioning package: ${expectedOutputPath}`
    );

    await expectZipContents(
      expectedOutputPath,
      path.resolve(testDir, 'expected')
    );
  });
});
