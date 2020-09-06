import { extractLocalizeTranslations, joinXliff, xi18n } from '../index';
import { logging } from '@angular-devkit/core';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { Writable, Readable } from 'stream';
import { JsonObject } from '@angular-devkit/core';
import { ExtractI18NOptions } from '../schema';

const writeFileMap: { [key: string]: string } = {};
const mockChildProcess = new EventEmitter() as childProcess.ChildProcess;
mockChildProcess.stdin = new Writable({ write: jest.fn, final: jest.fn });
mockChildProcess.stdout = new Readable({ read: jest.fn });
mockChildProcess.stderr = new Readable({
  read() {
    mockChildProcess.emit('close');
  },
});
describe('Extract i18n Target', () => {
  const infoLogs = [];
  function createLogger() {
    const logger = new logging.Logger('');
    logger.subscribe((ev) => {
      if (ev.level === 'info') {
        infoLogs.push(ev.message);
      }
    });
    return logger;
  }
  const options: ExtractI18NOptions & JsonObject = {
    format: 'xlf',
    appRoot: '',
    outFile: '',
    browserTarget: '',
    locale: 'en',
    outputPath: './test-resources/builders/extract-i18n/dist',
    localizeOutputPath:
      './test-resources/builders/extract-i18n/dist/localize-messages.xlf',
    root: '.',
    loglevel: 'error',
    useSourceMaps: false,
    useLegacyIds: false,
    duplicateMessageHandling: 'ignore',
    source: './test-resources/builders/extract-i18n/*.js',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context: any = {
    logger: createLogger(),
    target: {
      project: 'test',
      target: '',
    },
    /* eslint-disable @typescript-eslint/no-unused-vars */
    scheduleBuilder(_builderName: string) {
      // mock schedule builder
    },
  };

  it('triggers i18n extraction from templates', async () => {
    const scheduleBuilderSpy = jest.spyOn(context, 'scheduleBuilder');
    await xi18n(options, context);
    expect(scheduleBuilderSpy).toBeCalledWith(
      '@angular-devkit/build-angular:extract-i18n',
      {
        browserTarget: 'test:build',
        format: 'xlf',
        outputPath: './test-resources/builders/extract-i18n/dist',
        outFile: '',
      },
      {
        target: context.target,
      }
    );
  });

  it('extracts $localize messages to a file', async () => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, options) => {
      const fileName = path.basename(<string>filePath);
      writeFileMap[fileName] = <string>options;
    });
    const localizeMessagesFile = path.basename(options.localizeOutputPath);

    await extractLocalizeTranslations(options, context);
    expect(writeFileMap[localizeMessagesFile]).toContain('custom-id');
    expect(writeFileMap[localizeMessagesFile]).toContain('Custom id message');
    expect(writeFileMap[localizeMessagesFile]).toContain('custom-id-2');
    expect(writeFileMap[localizeMessagesFile]).toContain(
      'Custom and legacy message'
    );
  });

  it('triggers xliff-merge with expected options', async () => {
    const childProcessSpy = jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(mockChildProcess);
    const outFile = path.join(
      options['root'],
      options['appRoot'],
      context.target.project || '',
      'src',
      path.join(options.outputPath, 'messages.xlf')
    );
    await joinXliff(options, context);
    expect(childProcessSpy).toBeCalledWith(
      'xliff-join',
      [outFile, options['localizeOutputPath'], '-o', outFile],
      { stdio: 'pipe' }
    );
  });
});
