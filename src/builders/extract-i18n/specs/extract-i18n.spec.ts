import { Architect, BuilderOutput } from '@angular-devkit/architect';
import { TestingArchitectHost } from '@angular-devkit/architect/testing';
import { JsonObject, schema, logging } from '@angular-devkit/core';
import * as childProcess from 'child_process';

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import {
  expectZipContents,
  rootDir,
  cxPackageBuilderName,
} from '../../../helpers/test-utils';

import * as rimrafWithCallback from 'rimraf';
const rimraf = promisify(rimrafWithCallback);

/**
 * Path to the dir containing test assets.
 */
const testDir = path.resolve(
  rootDir,
  'test-resources',
  'builders',
  'extract-i18n',
  'hello-world-app'
);

describe('extract-i18n builder', () => {
  function testWithOptions(
    description: string,
    options: any,
    expectedOutput: string
  ) {
    describe(description, () => {
      const expectedOutputPath = path.resolve(testDir, 'dist');

      const infoLogs = [];

      let architect: Architect;
      let architectHost: TestingArchitectHost;
      let output: BuilderOutput;

      function linkBinary() {
        // Links binary `xliff-join` exposed in package json
        return childProcess.execSync('npm link');
      }

      async function cleanTestOutputDir() {
        await rimraf(path.resolve(testDir, 'dist'));
      }

      async function configureArchitect() {
        const registry = new schema.CoreSchemaRegistry();
        registry.addPostTransform(schema.transforms.addUndefinedDefaults);

        architectHost = new TestingArchitectHost(testDir, testDir);
        architect = new Architect(architectHost, registry);

        await architectHost.addBuilderFromPackage(
          '@angular-devkit/build-angular'
        );
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
        const logger: any = createLogger();

        const run = await architect.scheduleBuilder(
          '@bb-cli/angular-devkit:extract-i18n',
          options,
          {
            logger,
          }
        );

        output = await run.result;

        await run.stop();
      }

      async function mockMkDirTmp(prefix): Promise<string> {
        const dir = `${prefix}RANDOM`;
        await fs.promises.mkdir(dir);
        return dir;
      }

      beforeAll(async (done) => {
        // jest.spyOn(fs.promises, 'mkdtemp').mockImplementation(mockMkDirTmp);
        linkBinary();
        // await cleanTestOutputDir();
        await configureArchitect();
        await runBuilder();
        done();
      }, 30000);

      it('should report success', async () => {
        expect(output.success).toBe(true);
      });
    });
  }

  testWithOptions(
    'with multiple localised builds',
    {
      root: '.',
      appRoot: '',
      browserTarget: 'app:build',
      outputPath: 'messages',
    },
    'multi-locale'
  );
});
