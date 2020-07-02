import {CxPackageBuilderOptionsItem} from '../types';
import {BuilderContext} from '@angular-devkit/architect';
import * as path from 'path';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import {promisify} from 'util';

const ncp = promisify(require('ncp'));

export async function createPageContent(item: CxPackageBuilderOptionsItem, itemZipContentsDir: string, context: BuilderContext) {

  const builtSources = path.resolve(context.workspaceRoot, item.builtSources);
  const indexHtmlFile = path.resolve(builtSources, 'index.html');

  await copyBuiltSourcesToZipContentsDir();
  const entryFileName = await createEntryFileInZipContentsDir();
  const iconFileName = await copyIconToZipContentsDir();
  await createModelXml(entryFileName, iconFileName);

  return;

  async function copyBuiltSourcesToZipContentsDir() {
    const copyFilter = file => file !== indexHtmlFile;
    await ncp(builtSources, itemZipContentsDir, { filter: copyFilter });
  }

  async function createEntryFileInZipContentsDir(): Promise<string> {

    const indexHtmlContent = await fs.promises.readFile(indexHtmlFile, 'utf8')

    const styles = indexHtmlContent.match(/<link.*?href=".*?>/g).join('\n');
    const scripts = indexHtmlContent.match(/<script.*?src=".*?><\/script>/g).join('\n');

    const entryFileSource = path.resolve(context.workspaceRoot, item.entryFile);
    const entryFileName = path.basename(entryFileSource);
    const entryFileContent = (await fs.promises.readFile(entryFileSource, 'utf8'))
      .replace('{{styles}}', styles)
      .replace('{{scripts}}', scripts);

    const entryFileDest = path.resolve(itemZipContentsDir, entryFileName);

    await fs.promises.writeFile(entryFileDest, entryFileContent, 'utf8');

    return entryFileName;
  }

  async function copyIconToZipContentsDir(): Promise<string> {
    const icon = path.resolve(context.workspaceRoot, item.icon);
    const iconFileName = path.basename(icon);
    await fs.promises.copyFile(icon, path.resolve(itemZipContentsDir, iconFileName));
    return iconFileName;
  }

  async function createModelXml(entryFileName, iconFileName) {

    const modelXml: any = await readModelXml();

    const properties = getPageProperties(modelXml);

    setProperty(properties, 'src', `$(itemRoot)/${entryFileName}`);
    setProperty(properties, 'thumbnailUrl', `$(itemRoot)/${iconFileName}`);

    await writeModelXml(modelXml);
  }

  async function readModelXml() {
    const parser = new xml2js.Parser();
    const modelXml = path.resolve(context.workspaceRoot, item.modelXml);
    return new Promise((resolve, reject) => {
      fs.readFile(modelXml, function(err, data) {
        if (err) {
          return reject(err);
        }
        parser.parseString(data, function (err, result) {
          if (err) {
            return reject(err);
          }
          resolve(result);
        });
      });
    })
  }

  async function writeModelXml(modelXmlJson) {
    const builder = new xml2js.Builder();
    const xml = builder.buildObject(modelXmlJson);
    const dest = path.resolve(itemZipContentsDir, 'model.xml');
    await fs.promises.writeFile(dest, xml, 'utf8');
  }
}

function getPageProperties(modelXml) {
  const page = modelXml?.catalog?.page?.[0];
  if (!page) {
    throw new Error('Invalid model.xml - expected path modelXml.catalog.page to be present');
  }

  if (!page.properties) {
    page.properties = [{
      property: []
    }];
  }

  return page.properties;
}

function setProperty(properties, name, value) {
  const prop = properties[0].property.find(p => p['$']?.name === name);
  if (prop) {
    prop.value[0]._ = value;
  } else {
    properties[0].property.push({
      "$": {
        "name": name
      },
      "value": [
        {
          "_": value,
          "$": {
            "type": "string"
          }
        }
      ]
    });
  }
}
