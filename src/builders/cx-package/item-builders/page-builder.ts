import { CxPackageBuilderOptionsItem } from '../types';
import { BuilderContext } from '@angular-devkit/architect';
import * as path from 'path';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import { promisify } from 'util';

const ncp = promisify(require('ncp'));

export async function createPageContent(
  item: CxPackageBuilderOptionsItem,
  itemZipContentsDir: string,
  context: BuilderContext
) {
  const builtSources = path.resolve(context.workspaceRoot, item.builtSources);
  const indexHtmlFile = path.resolve(builtSources, 'index.html');

  await copyBuiltSourcesToZipContentsDir();
  const entryFileName = await createEntryFileInZipContentsDir();
  const iconFileName = await copyIconToZipContentsDir();
  await createModelXml(entryFileName, iconFileName);

  return;

  async function copyBuiltSourcesToZipContentsDir() {
    const copyFilter = (file) => file !== indexHtmlFile;
    await ncp(builtSources, itemZipContentsDir, { filter: copyFilter });
  }

  async function createEntryFileInZipContentsDir(): Promise<string> {
    const indexHtmlContent = await fs.promises.readFile(indexHtmlFile, 'utf8');

    const styles = indexHtmlContent.match(/<link.*?href=".*?>/g).join('\n');
    const scripts = indexHtmlContent
      .match(/<script.*?src=".*?><\/script>/g)
      .join('\n');

    const entryFileSource = path.resolve(context.workspaceRoot, item.entryFile);
    const entryFileName = path.basename(entryFileSource);
    const entryFileContent = (
      await fs.promises.readFile(entryFileSource, 'utf8')
    )
      .replace('{{styles}}', styles)
      .replace('{{scripts}}', scripts);

    const entryFileDest = path.resolve(itemZipContentsDir, entryFileName);

    await fs.promises.writeFile(entryFileDest, entryFileContent, 'utf8');

    return entryFileName;
  }

  async function copyIconToZipContentsDir(): Promise<string> {
    const icon = path.resolve(context.workspaceRoot, item.icon);
    const iconFileName = path.basename(icon);
    await fs.promises.copyFile(
      icon,
      path.resolve(itemZipContentsDir, iconFileName)
    );
    return iconFileName;
  }

  async function createModelXml(entryFileName, iconFileName) {
    const modelXml: JSDOM = await readModelXml();

    const properties = getPageProperties(modelXml);

    setProperty(properties, 'src', `$(itemRoot)/${entryFileName}`);
    setProperty(properties, 'thumbnailUrl', `$(itemRoot)/${iconFileName}`);

    await writeModelXml(modelXml);
  }

  async function readModelXml(): Promise<JSDOM> {
    const modelXml = path.resolve(context.workspaceRoot, item.modelXml);
    return JSDOM.fromFile(modelXml, {
      contentType: 'text/xml',
    });
  }

  async function writeModelXml(modelXml: JSDOM) {
    const dest = path.resolve(itemZipContentsDir, 'model.xml');
    await fs.promises.writeFile(dest, modelXml.serialize(), 'utf8');
  }
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
