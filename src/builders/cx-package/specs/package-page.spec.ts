import { Architect, BuilderOutput } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing';
import { JsonObject, logging, schema } from '@angular-devkit/core';

import * as path from 'path';
import { CxPackageBuilderOptions } from '../schema';
import { promisify } from 'util';
import { expectZipContents, rootDir, cxPackageBuilderName } from './test-utils';

import * as rimrafWithCallback from 'rimraf';
const rimraf = promisify(rimrafWithCallback);

/**
 * Path to the dir containing test assets.
 */
const testDir = path.resolve(
  rootDir,
  'test-resources',
  'builders',
  'cx-package',
  'page-builder'
);

describe('cx-package builder with page item', () => {
  const options: CxPackageBuilderOptions & JsonObject = {
    items: [
      {
        type: 'page',
        name: 'test-page',
        entryFile: 'resources/index.hbs',
        icon: 'resources/icon.png',
        builtSources: 'build',
        modelXml: 'resources/model.xml'
      },
    ],
    destFileName: 'my-awesome-package.zip',
    skipCleanUp: true,
  };

  const expectedOutputPath = path.resolve(
    testDir,
    'dist',
    'provisioning-packages',
    options.destFileName
  );

  const infoLogs = [];

  let architect: Architect;
  let architectHost: TestingArchitectHost;
  let output: BuilderOutput;

  async function cleanTestOutputDir() {
    await rimraf(path.resolve(testDir, 'dist'));
  }

  async function configureArchitect() {
    const registry = new schema.CoreSchemaRegistry();
    registry.addPostTransform(schema.transforms.addUndefinedDefaults);

    architectHost = new TestingArchitectHost(testDir, testDir);
    architect = new Architect(architectHost, registry);

    await architectHost.addBuilderFromPackage(rootDir);
  }

  function createLogger() {
    const logger = new logging.Logger('');
    logger.subscribe((ev) => {
      if (ev.level === 'info') {
        infoLogs.push(ev.message);
      }
    });
    return logger;
  }

  async function runBuilder() {
    const logger = createLogger();

    const run = await architect.scheduleBuilder(
      cxPackageBuilderName,
      options,
      { logger }
    );

    output = await run.result;

    await run.stop();
  }

  beforeAll(async () => {
    await cleanTestOutputDir();
    await configureArchitect();
    await runBuilder();
  });

  it('should report success', () => {
    expect(output.success).toBe(true);
  });

  it('should log the path to the built package', () => {
    expect(infoLogs).toContain(
      `Created provisioning package: ${expectedOutputPath}`
    );
  });

  it('should generate a zip containing the page', async () => {
    await expectZipContents(
      expectedOutputPath,
      path.resolve(testDir, 'expected')
    );
  });
});
