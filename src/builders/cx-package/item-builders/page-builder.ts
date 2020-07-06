import * as path from 'path';
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';
import { promisify } from 'util';
import { ItemBuilder, ItemBuilderContext } from '../types';
import * as ncpWithCallback from 'ncp';

const ncp = promisify(ncpWithCallback);

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
  const modelXml: Document = await readModelXml(context);

  const properties = getPageProperties(modelXml);

  setProperty(properties, 'src', `$(itemRoot)/${entryFileName}`);
  setProperty(properties, 'thumbnailUrl', `$(itemRoot)/${iconFileName}`);

  await writeModelXml(modelXml, context.destDir);
}

async function readModelXml(context: ItemBuilderContext): Promise<Document> {
  const { item, builderContext } = context;
  const modelXml = path.resolve(builderContext.workspaceRoot, item.modelXml);
  const modelXmlContent = await fs.promises.readFile(modelXml, 'utf8');
  return new DOMParser().parseFromString(modelXmlContent);
}

async function writeModelXml(modelXml: Document, destDir: string) {
  const dest = path.resolve(destDir, 'model.xml');
  const content = new XMLSerializer().serializeToString(modelXml);
  await fs.promises.writeFile(dest, content, 'utf8');
}

function getPageProperties(modelXml: Document) {
  const catalog = modelXml.documentElement;
  if (catalog.tagName !== 'catalog') {
    throw new Error(
      `Invalid model.xml - expected document element to have tag name 'catalog', but was: '${catalog.tagName}'`
    );
  }

  const page: Element = findChild(catalog, 'page');
  if (!page) {
    throw new Error(
      'Invalid model.xml - expected a <page> child of the <catalog> document element'
    );
  }

  let properties = findChild(page, 'properties');

  if (!properties) {
    properties = modelXml.createElement('properties');
    page.appendChild(properties);
  }

  return properties;
}

function setProperty(properties, name, value) {
  const propertyMatcher = (elem) =>
    elem.tagName === 'property' && elem.getAttribute('name') === name;

  let propertyElem: Element = findChild(properties, propertyMatcher);
  if (!propertyElem) {
    propertyElem = properties.ownerDocument.createElement('property');
    propertyElem.setAttribute('name', name);
    properties.appendChild(propertyElem);
  }

  let valueElem: Element = findChild(propertyElem, 'value');
  if (!valueElem) {
    valueElem = propertyElem.ownerDocument.createElement('value');
    propertyElem.appendChild(valueElem);
  }
  valueElem.setAttribute('type', 'string');
  valueElem.textContent = value;
}

function findChild(
  parentElem: Element,
  predicateOrTagName: ((elem: Element) => boolean) | string
): Element {
  const predicate =
    'string' === typeof predicateOrTagName
      ? (elem: Element) => elem.tagName === predicateOrTagName
      : predicateOrTagName;
  return <Element>Array.from(parentElem.childNodes).find(predicate);
}
