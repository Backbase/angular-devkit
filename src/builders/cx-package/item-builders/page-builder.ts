import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { promisify } from 'util';
import { ItemBuilder, ItemBuilderContext } from '../types';

const ncp = promisify(require('ncp'));

export const createPageContent: ItemBuilder = async (
  context: ItemBuilderContext
) => {
  const builtSources = path.resolve(
    context.builderContext.workspaceRoot,
    context.item.builtSources
  );
  const indexHtmlFile = path.resolve(builtSources, 'index.html');

  await copyBuiltSourcesToZipContentsDir(
    builtSources,
    context.destDir,
    (file) => file !== indexHtmlFile
  );
  const entryFileName = await createEntryFileInZipContentsDir(
    indexHtmlFile,
    context
  );
  const iconFileName = await copyIconToZipContentsDir(context);
  await createModelXml(entryFileName, iconFileName, context);
};

async function copyBuiltSourcesToZipContentsDir(
  builtSources: string,
  itemZipContentsDir: string,
  copyFilter: (file: string) => boolean
) {
  await ncp(builtSources, itemZipContentsDir, { filter: copyFilter });
}

async function createEntryFileInZipContentsDir(
  indexHtmlFile: string,
  context: ItemBuilderContext
): Promise<string> {
  const { item, destDir, builderContext } = context;
  const indexHtmlContent = await fs.promises.readFile(indexHtmlFile, 'utf8');

  const styles = indexHtmlContent.match(/<link.*?href=".*?>/g).join('\n');
  const scripts = indexHtmlContent
    .match(/<script.*?src=".*?><\/script>/g)
    .join('\n');

  const entryFileSource = path.resolve(
    builderContext.workspaceRoot,
    item.entryFile
  );
  const entryFileName = path.basename(entryFileSource);
  const entryFileContent = (await fs.promises.readFile(entryFileSource, 'utf8'))
    .replace('{{styles}}', styles)
    .replace('{{scripts}}', scripts);

  const entryFileDest = path.resolve(destDir, entryFileName);

  await fs.promises.writeFile(entryFileDest, entryFileContent, 'utf8');

  return entryFileName;
}

async function copyIconToZipContentsDir(
  context: ItemBuilderContext
): Promise<string> {
  const { item, destDir, builderContext } = context;
  const icon = path.resolve(builderContext.workspaceRoot, item.icon);
  const iconFileName = path.basename(icon);
  await fs.promises.copyFile(icon, path.resolve(destDir, iconFileName));
  return iconFileName;
}

async function createModelXml(
  entryFileName: string,
  iconFileName: string,
  context: ItemBuilderContext
) {
  const modelXml: JSDOM = await readModelXml(context);

  const properties = getPageProperties(modelXml);

  setProperty(properties, 'src', `$(itemRoot)/${entryFileName}`);
  setProperty(properties, 'thumbnailUrl', `$(itemRoot)/${iconFileName}`);

  await writeModelXml(modelXml, context.destDir);
}

async function readModelXml(context: ItemBuilderContext): Promise<JSDOM> {
  const { item, builderContext } = context;
  const modelXml = path.resolve(builderContext.workspaceRoot, item.modelXml);
  return JSDOM.fromFile(modelXml, {
    contentType: 'text/xml',
  });
}

async function writeModelXml(modelXml: JSDOM, destDir: string) {
  const dest = path.resolve(destDir, 'model.xml');
  await fs.promises.writeFile(dest, modelXml.serialize(), 'utf8');
}

function getPageProperties(modelXml: JSDOM) {
  const catalog = modelXml.window.document.documentElement;
  if (catalog.tagName !== 'catalog') {
    throw new Error(
      `Invalid model.xml - expected document element to have tag name 'catalog', but was: '${catalog.tagName}'`
    );
  }

  const page: any = findChild(catalog, 'page');
  if (!page) {
    throw new Error(
      'Invalid model.xml - expected a <page> child of the <catalog> document element'
    );
  }

  let properties = findChild(page, 'properties');

  if (!properties) {
    properties = modelXml.window.document.createElement('properties');
    page.appendChild(properties);
  }

  return properties;
}

function setProperty(properties, name, value) {
  const propertyMatcher = (elem: any) =>
    elem.tagName === 'property' && elem.getAttribute('name') === name;

  let propertyElem: any = findChild(properties, propertyMatcher);
  if (!propertyElem) {
    propertyElem = properties.ownerDocument.createElement('property');
    propertyElem.setAttribute('name', name);
    properties.appendChild(propertyElem);
  }

  let valueElem: any = Array.from(propertyElem.children).find(
    (elem: any) => elem.tagName === 'value'
  );
  if (!valueElem) {
    valueElem = propertyElem.ownerDocument.createElement('value');
    propertyElem.appendChild(valueElem);
  }
  valueElem.setAttribute('type', 'string');
  valueElem.textContent = value;
}

function findChild(
  parentElem: any,
  predicateOrTagName: ((elem: any) => boolean) | string
) {
  const predicate =
    'string' === typeof predicateOrTagName
      ? (elem: any) => elem.tagName === predicateOrTagName
      : predicateOrTagName;
  return Array.from(parentElem.children).find(predicate);
}
