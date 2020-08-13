import {
  createBuilder,
  BuilderOutput,
  BuilderContext,
} from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { extractTranslations } from '../../helpers/extract/main';
import { LogLevel, ConsoleLogger } from '../../helpers/ngtsc-utils/logging';
import * as glob from 'glob';
import * as childProcess from 'child_process';
import * as path from 'path';
import {
  NodeJSFileSystem,
  setFileSystem,
} from '@angular/compiler-cli/src/ngtsc/file_system';

interface Options extends JsonObject {
  format:
    | 'xmb'
    | 'xlf'
    | 'xlif'
    | 'xliff'
    | 'xlf2'
    | 'xlif2'
    | 'xliff2'
    | 'json';
  locale: string;
  root: string;
  appRoot: string;
  outputPath: string;
  outFile: string;
  browserTarget: string;
  localizeOutputPath: string;
  loglevel: 'debug' | 'info' | 'warn' | 'error';
  useSourceMaps: boolean;
  useLegacyIds: boolean;
  prod?: boolean;
  progress?: boolean;
  duplicateMessageHandling: 'error' | 'warning' | 'ignore';
}

export default createBuilder<Options>(
  async (options: Options, context: BuilderContext) => {
    try {
      const i18nExtract = await xi18n(options, context);
      const result = await i18nExtract.result;
      if (result.success) {
        await extractLocalizeTranslations(options, context);
      }
      return await joinXliff(options, context);
    } catch (error) {
      context.logger.error(error);
      return { success: false };
    }
  }
);

function xi18n(options: Options, context: BuilderContext) {
  context.logger.info('Extracting i18n...');
  return context.scheduleBuilder(
    '@angular-devkit/build-angular:extract-i18n',
    {
      browserTarget:
        options['browserTarget'] || `${context.target?.project || ''}:build`,
      format: options['format'],
      outputPath: options['outputPath'],
      outFile: options['outFile'],
    },
    {
      target: context.target,
    }
  );
}

function extractLocalizeTranslations(
  options: Options,
  context: BuilderContext
) {
  context.logger.info(`Extracting localize i18n...`);
  const fs = new NodeJSFileSystem();
  setFileSystem(fs);
  const rootPath = options['root'] || context.target.project;
  const filePath = Array.isArray(options['source'])
    ? options['source'].length > 1
      ? `{${options['source'].join(',')}}`
      : options['source'][0]
    : options['source'];
  const sourceFilePaths = glob.sync(filePath, {
    cwd: rootPath,
    nodir: true,
  });
  const logLevel = options['loglevel'] as keyof typeof LogLevel | undefined;
  const logger = new ConsoleLogger(
    logLevel ? LogLevel[logLevel] : LogLevel.warn
  );

  return extractTranslations({
    rootPath,
    sourceFilePaths,
    sourceLocale: options['locale'],
    format: options['format'],
    outputPath: options['localizeOutputPath'],
    logger,
    useSourceMaps: options['useSourceMaps'],
    useLegacyIds: options['useLegacyIds'],
    duplicateMessageHandling: options['duplicateMessageHandling'],
  });
}

function joinXliff(options: Options, context: BuilderContext) {
  context.logger.info(
    `Merging extracted i18n messages with localize messages...`
  );
  return new Promise<BuilderOutput>((resolve, reject) => {
    const outFile = path.join(
      options['root'],
      options['appRoot'],
      context.target.project,
      'src',
      getOutFilePath(options)
    );
    const child = childProcess.spawn(
      'xliff-join',
      [outFile, options['localizeOutputPath'], '-o', outFile],
      { stdio: 'pipe' }
    );

    child.stdout.on('data', (data) => {
      context.logger.info(data.toString());
    });

    child.stderr.on('data', (data) => {
      context.logger.error(data.toString());
      reject({ success: false });
    });

    child.on('close', (code) => {
      resolve({ success: code === 0 });
    });
  });
}

function getOutFilePath(options) {
  let outFile = options.outFile || getI18nOutfile(options.format);
  if (options.outputPath) {
    outFile = path.join(options.outputPath, outFile);
  }

  return outFile;
}

function getI18nOutfile(format) {
  switch (format) {
    case 'xmb':
      return 'messages.xmb';
    case 'xlf':
    case 'xlif':
    case 'xliff':
    case 'xlf2':
    case 'xliff2':
      return 'messages.xlf';
    default:
      throw new Error(`Unsupported format "${format}"`);
  }
}
