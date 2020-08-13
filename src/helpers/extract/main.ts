#!/usr/bin/env node
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {
  getFileSystem,
  setFileSystem,
  NodeJSFileSystem,
  AbsoluteFsPath,
} from '@angular/compiler-cli/src/ngtsc/file_system';
import { Logger } from '../ngtsc-utils/logging';
import { ɵParsedMessage } from '@angular/localize';

import { DiagnosticHandlingStrategy } from '../diagnostics';

import { checkDuplicateMessages } from './duplicates';
import { MessageExtractor } from './extraction';
import { TranslationSerializer } from './translation_files/translation_serializer';
import { SimpleJsonTranslationSerializer } from './translation_files/json_translation_serializer';
import { Xliff1TranslationSerializer } from './translation_files/xliff1_translation_serializer';
import { Xliff2TranslationSerializer } from './translation_files/xliff2_translation_serializer';
import { XmbTranslationSerializer } from './translation_files/xmb_translation_serializer';

export interface ExtractTranslationsOptions {
  /**
   * The locale of the source being processed.
   */
  sourceLocale: string;
  /**
   * The base path for other paths provided in these options.
   * This should either be absolute or relative to the current working directory.
   */
  rootPath: string;
  /**
   * An array of paths to files to search for translations. These should be relative to the
   * rootPath.
   */
  sourceFilePaths: string[];
  /**
   * The format of the translation file.
   */
  format: string;
  /**
   * A path to where the translation file will be written. This should be relative to the rootPath.
   */
  outputPath: string;
  /**
   * The logger to use for diagnostic messages.
   */
  logger: Logger;
  /**
   * Whether to generate source information in the output files by following source-map mappings
   * found in the source file.
   */
  useSourceMaps: boolean;
  /**
   * Whether to use the legacy id format for messages that were extracted from Angular templates
   */
  useLegacyIds: boolean;
  /**
   * How to handle messages with the same id but not the same text.
   */
  duplicateMessageHandling: DiagnosticHandlingStrategy;
}

export function extractTranslations({
  rootPath,
  sourceFilePaths,
  sourceLocale,
  format,
  outputPath: output,
  logger,
  useSourceMaps,
  useLegacyIds,
  duplicateMessageHandling,
}: ExtractTranslationsOptions): void {
  const fs = getFileSystem();
  const basePath = fs.resolve(rootPath);
  const extractor = new MessageExtractor(fs, logger, {
    basePath,
    useSourceMaps,
  });

  const messages: ɵParsedMessage[] = [];
  for (const file of sourceFilePaths) {
    messages.push(...extractor.extractMessages(file));
  }

  const diagnostics = checkDuplicateMessages(
    fs,
    messages,
    duplicateMessageHandling,
    basePath
  );
  if (diagnostics.hasErrors) {
    throw new Error(
      diagnostics.formatDiagnostics('Failed to extract messages')
    );
  }

  const outputPath = fs.resolve(rootPath, output);
  const serializer = getSerializer(
    format,
    sourceLocale,
    fs.dirname(outputPath),
    useLegacyIds
  );
  const translationFile = serializer.serialize(messages);
  fs.ensureDir(fs.dirname(outputPath));
  fs.writeFile(outputPath, translationFile);

  if (diagnostics.messages.length) {
    logger.warn(
      diagnostics.formatDiagnostics('Messages extracted with warnings')
    );
  }
}

export function getSerializer(
  format: string,
  sourceLocale: string,
  rootPath: AbsoluteFsPath,
  useLegacyIds: boolean
): TranslationSerializer {
  switch (format) {
    case 'xlf':
    case 'xlif':
    case 'xliff':
      return new Xliff1TranslationSerializer(
        sourceLocale,
        rootPath,
        useLegacyIds
      );
    case 'xlf2':
    case 'xlif2':
    case 'xliff2':
      return new Xliff2TranslationSerializer(
        sourceLocale,
        rootPath,
        useLegacyIds
      );
    case 'xmb':
      return new XmbTranslationSerializer(rootPath, useLegacyIds);
    case 'json':
      return new SimpleJsonTranslationSerializer(sourceLocale);
  }
  throw new Error(
    `No translation serializer can handle the provided format: ${format}`
  );
}
