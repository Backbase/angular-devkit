import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { CxPackageBuilderOptions } from "./schema";
import * as fs from 'fs';
import * as path from 'path';
import { JsonObject } from "@angular-devkit/core";
import * as zipFolder from 'zip-folder';
import * as rimraf from 'rimraf';

export default createBuilder(cxPackageBuilder);

async function cxPackageBuilder(
    options: CxPackageBuilderOptions & JsonObject,
    context: BuilderContext,
): Promise<BuilderOutput> {
  const destDir = path.resolve(context.workspaceRoot, options.destDir);
  const { destFileName } = options;

  await fs.promises.mkdir(destDir, {recursive: true});

  const tmpDirName = await createTmpDir(destDir, destFileName);

  await createZipOfZips(destDir, destFileName, tmpDirName, [], context);

  return new Promise(resolve => {
    context.logger.debug('Cleaning up...');
    rimraf(tmpDirName, error => {
      if (error) {
        context.logger.warn(`Error deleting tmp dir ${tmpDirName}: ${error}`);
      }
      resolve({
        success: true
      });
    });
  });
}

async function createTmpDir(destDir: string, destFileName: string): Promise<string> {
  let tmpDirName: string;
  let i = 0;
  do {
    tmpDirName = path.resolve(destDir, `${destFileName}.${i++}.tmp`);
  } while (!await createDirIfNotExists(destDir, tmpDirName));
  return tmpDirName;
}

async function createDirIfNotExists(parent: string, dir: string): Promise<boolean> {
  return fs.promises.mkdir(dir)
    .then(() => true)
    .catch(err => {
      if (err?.code === 'EEXIST') {
        return false;
      }
      throw err;
    });
}

async function createZipOfZips(destPath: string, destFileName: string, tmpPath: string, provisioningItems: any[], context: BuilderContext) {
  const manifest = {
    name: 'catalog',
    provisioningItems: provisioningItems
  };

  const zozContentPath = `${tmpPath}/zoz/${destFileName}-content`;
  await fs.promises.mkdir(zozContentPath, {recursive: true});
  await createManifest(zozContentPath, manifest);

  await Promise.all(
      provisioningItems
        .map(item => item.location)
        .map(zip => fs.promises.rename(`${tmpPath}/${zip}`, `${zozContentPath}/${zip}`))
  );

  const zozPath = path.resolve(destPath, destFileName);

  return new Promise((resolve, reject) => {
    zipFolder(zozContentPath, zozPath, err => {
      if (err) {
        reject(err);
      } else {
        context.logger.info(`Created provisioning package: ${zozPath}`)
        resolve();
      }
    });
  });
}

async function createManifest(dir: string, manifest) {
  await fs.promises.writeFile(
      `${dir}/manifest.json`,
      JSON.stringify(manifest, undefined, 2),
      'utf8'
  );
}
