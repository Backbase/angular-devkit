import {
  BuilderContext,
  BuilderOutput,
  createBuilder,
} from '@angular-devkit/architect';
import { CxPackageBuilderOptions } from './schema';
import {
  CxPackageBuilderOptionsItem,
  ItemBuilder,
  ProvisioningItem,
  ProvisioningItemFactory,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import { JsonObject } from '@angular-devkit/core';
import { promisify } from 'util';
import { createPageContent } from './item-builders/page-builder';
import * as zipFolderWithCallback from 'zip-folder';
import * as rimrafWithCallback from 'rimraf';

const zipFolder = promisify(zipFolderWithCallback);
const rimraf = promisify(rimrafWithCallback);

export default createBuilder(cxPackageBuilder);

async function cxPackageBuilder(
  options: CxPackageBuilderOptions & JsonObject,
  context: BuilderContext
): Promise<BuilderOutput> {
  const destDir = path.resolve(context.workspaceRoot, options.destDir);
  const { destFileName, items, skipCleanUp } = options;

  await fs.promises.mkdir(destDir, { recursive: true });

  const tmpDirName = await createTmpDir(destDir, destFileName);

  const createProvisioningItem = createProvisioningItemFactory(
    tmpDirName,
    context
  );

  const provisioningItems = await Promise.all(
    items.map(createProvisioningItem)
  );

  const packageFile = await createZipOfZips(
    destDir,
    destFileName,
    tmpDirName,
    provisioningItems
  );
  context.logger.info(`Created provisioning package: ${packageFile}`);

  if (skipCleanUp) {
    context.logger.debug(`Skipping cleaning up tmp dir ${tmpDirName}`);
  } else {
    context.logger.debug('Cleaning up...');
    await rimraf(tmpDirName).catch((error) => {
      context.logger.warn(`Error deleting tmp dir ${tmpDirName}: ${error}`);
    });
  }

  return {
    success: true,
  };
}

function getItemBuilder(item: CxPackageBuilderOptionsItem): ItemBuilder {
  switch (item.type) {
    case 'page':
      return createPageContent;
    default:
      // Default for completeness, but this should be picked up by the schema validation before we started
      throw new Error(
        `Invalid type for provisioning item "${item.name}": "${item.type}"`
      );
  }
}

function createProvisioningItemFactory(
  tmpDirName: string,
  context: BuilderContext
): ProvisioningItemFactory {
  return async (item) => {
    const kebabCaseName = item.name.replace(/\s+/g, '-');
    const itemZipContentsDir = await createTmpDir(
      tmpDirName,
      `${kebabCaseName}-${item.type}`
    );

    const itemZipFileName = `${path.basename(itemZipContentsDir, '.tmp')}.zip`;
    context.logger.debug(
      `Creating provisioning item "${item.name}" as ${itemZipFileName}...`
    );
    const buildItem = getItemBuilder(item);
    await buildItem({
      item,
      destDir: itemZipContentsDir,
      builderContext: context,
    });

    await zipFolder(
      itemZipContentsDir,
      path.resolve(tmpDirName, itemZipFileName)
    );

    return {
      name: item.name,
      itemType: 'catalog',
      location: itemZipFileName,
    };
  };
}

async function createTmpDir(
  destDir: string,
  destFileName: string
): Promise<string> {
  let tmpDirName: string;
  let i = 0;
  do {
    tmpDirName = path.resolve(destDir, `${destFileName}.${i++}.tmp`);
  } while (!(await createDirIfNotExists(destDir, tmpDirName)));
  return tmpDirName;
}

async function createDirIfNotExists(
  parent: string,
  dir: string
): Promise<boolean> {
  return fs.promises
    .mkdir(dir)
    .then(() => true)
    .catch((err) => {
      if (err?.code === 'EEXIST') {
        return false;
      }
      throw err;
    });
}

async function createZipOfZips(
  destPath: string,
  destFileName: string,
  tmpPath: string,
  provisioningItems: ProvisioningItem[]
) {
  const manifest = {
    name: 'catalog',
    provisioningItems: provisioningItems,
  };

  const zozContentPath = `${tmpPath}/zoz/${destFileName}-content`;
  await fs.promises.mkdir(zozContentPath, { recursive: true });
  await createManifest(zozContentPath, manifest);

  await Promise.all(
    provisioningItems
      .map((item) => item.location)
      .map((zip) =>
        fs.promises.rename(`${tmpPath}/${zip}`, `${zozContentPath}/${zip}`)
      )
  );

  const zozPath = path.resolve(destPath, destFileName);
  await zipFolder(zozContentPath, zozPath);
  return zozPath;
}

async function createManifest(dir: string, manifest) {
  await fs.promises.writeFile(
    `${dir}/manifest.json`,
    JSON.stringify(manifest, undefined, 2),
    'utf8'
  );
}
