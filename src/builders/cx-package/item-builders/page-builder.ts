import * as path from 'path';
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';
import { promisify } from 'util';
import { ItemBuilder, ItemBuilderContext } from '../types';
import * as ncpWithCallback from 'ncp';
import * as parse5 from 'parse5';

const ncp = promisify(ncpWithCallback);

type LocalisedIndexHtmlFiles = { [lang: string]: string };
type LocalisedScriptsAndLinks = {
  lang: string;
  scripts: string[];
  links: string[];
  dir: string;
};

export const createPageContent: ItemBuilder = async (
  context: ItemBuilderContext
) => {
  const builtSources = path.resolve(
    context.builderContext.workspaceRoot,
    context.item.builtSources
  );
  const indexHtmlFiles = getLocalisedIndexFiles(builtSources, context);

  await copyBuiltSourcesToZipContentsDir(
    builtSources,
    context.destDir,
    (file) => !Object.values(indexHtmlFiles).includes(file)
  );
  const entryFileName = await createEntryFileInZipContentsDir(
    builtSources,
    indexHtmlFiles,
    context
  );
  const iconFileName = await copyIconToZipContentsDir(context);
  await createModelXml(entryFileName, iconFileName, context);
};

function getLocalisedIndexFiles(
  builtSources: string,
  context: ItemBuilderContext
) {
  const indexFileName = context.item.builtIndex || 'index.html';
  if (context.item.locales && context.item.locales.length) {
    return context.item.locales.reduce((acc, lang) => {
      acc[lang] = path.resolve(builtSources, lang, indexFileName);
      return acc;
    }, {} as LocalisedIndexHtmlFiles);
  }
  return { _: path.resolve(builtSources, indexFileName) };
}

async function copyBuiltSourcesToZipContentsDir(
  builtSources: string,
  itemZipContentsDir: string,
  copyFilter: (file: string) => boolean
) {
  await ncp(builtSources, itemZipContentsDir, { filter: copyFilter });
}

async function createEntryFileInZipContentsDir(
  builtSourcesRoot: string,
  indexHtmlFiles: LocalisedIndexHtmlFiles,
  context: ItemBuilderContext
): Promise<string> {
  const { item, destDir, builderContext } = context;

  const { scripts, links } = await getScriptsAndLinks(
    builtSourcesRoot,
    indexHtmlFiles
  );

  const localDirs = (item.locales || []).reduce((acc, next) => {
    acc[next] = `${next}/`;
    return acc;
  }, {});

  const entryFileSource = path.resolve(
    builderContext.workspaceRoot,
    item.entryFile
  );
  const entryFileName = path.basename(entryFileSource);
  const entryFileContent = (await fs.promises.readFile(entryFileSource, 'utf8'))
    .replace('{{localeDirs}}', JSON.stringify(localDirs))
    .replace('{{styles}}', links)
    .replace('{{scripts}}', scripts);

  const entryFileDest = path.resolve(destDir, entryFileName);

  await fs.promises.writeFile(entryFileDest, entryFileContent, 'utf8');

  return entryFileName;
}

async function getScriptsAndLinks(
  relativiseFrom: string,
  indexHtmlFiles: LocalisedIndexHtmlFiles
): Promise<{ scripts: string; links: string }> {
  const localisedScriptsAndLinks = await extractAllScriptAndLinkTags(
    relativiseFrom,
    indexHtmlFiles
  );
  if (localisedScriptsAndLinks.length === 1) {
    return {
      scripts: localisedScriptsAndLinks[0].scripts.join('\n'),
      links: localisedScriptsAndLinks[0].links.join('\n'),
    };
  }

  const { scripts, links } = localisedScriptsAndLinks.reduce(
    (acc, next, idx) => {
      const ifStart = idx ? '{{else if' : '{{#if';
      const condition = `${ifStart} (equal locale "${next.lang}")}}`;
      return {
        scripts: `${acc.scripts}${condition}\n${next.scripts.join('\n')}\n`,
        links: `${acc.links}${condition}\n${next.links.join('\n')}\n`,
      };
    },
    { scripts: '', links: '' }
  );
  return {
    scripts: `${scripts}{{/if}}`,
    links: `${links}{{/if}}`,
  };
}

async function extractAllScriptAndLinkTags(
  relativiseFrom: string,
  indexHtmlFiles: LocalisedIndexHtmlFiles
): Promise<LocalisedScriptsAndLinks[]> {
  const promises = Object.entries(indexHtmlFiles).reduce(
    (acc, [lang, indexHtmlFile]) => {
      acc.push(extractScriptAndLinkTags(lang, indexHtmlFile, relativiseFrom));
      return acc;
    },
    [] as Promise<LocalisedScriptsAndLinks>[]
  );
  return Promise.all(promises);
}

async function extractScriptAndLinkTags(
  lang: string,
  indexHtmlFile: string,
  relativiseFrom: string
): Promise<LocalisedScriptsAndLinks> {
  const relativePrefix = path.relative(
    relativiseFrom,
    path.dirname(indexHtmlFile)
  );

  const indexHtmlContent = await fs.promises.readFile(indexHtmlFile, 'utf8');
  const indexHtmlDom: Document = parse5.parse(indexHtmlContent);
  const html = findChild(indexHtmlDom, 'html');

  const head = findChild(html, 'head');
  const links = findChildren(head, 'link').map((elem) => {
    if (relativePrefix) {
      prefixAttribute(elem, 'href', relativePrefix);
    }
    return parse5.serialize({ childNodes: [elem] });
  });

  const body = findChild(html, 'body');
  const scripts = findChildren(body, 'script').map((elem) => {
    if (relativePrefix) {
      prefixAttribute(elem, 'src', relativePrefix);
    }
    return parse5.serialize({ childNodes: [elem] }).replace(/=""/g, '');
  });

  return {
    lang,
    scripts,
    links,
    dir: relativePrefix ? `${relativePrefix}/` : '',
  };
}

function prefixAttribute(elem, attrName, prefix) {
  // parse5 doesn't support the DOM API so can't use getAttribute/setAttribute
  elem.attrs.find((attr) => {
    if (attr.name === attrName) {
      attr.value = `${prefix}/${attr.value}`;
      return true;
    }
  });
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
  parentElem: Node,
  predicateOrTagName: ((elem: Element) => boolean) | string
): Element {
  const predicate =
    'string' === typeof predicateOrTagName
      ? (elem: Element) => elem.tagName === predicateOrTagName
      : predicateOrTagName;
  return <Element>Array.from(parentElem.childNodes).find(predicate);
}

function findChildren(
  parentElem: Node,
  predicateOrTagName: ((elem: Element) => boolean) | string
): Element[] {
  const predicate =
    'string' === typeof predicateOrTagName
      ? (elem: Element) => elem.tagName === predicateOrTagName
      : predicateOrTagName;
  return <Element[]>Array.from(parentElem.childNodes).filter(predicate);
}
