import {
  getFileSystem,
  AbsoluteFsPath,
} from '@angular/compiler-cli/src/ngtsc/file_system';
import { Logger } from '@angular/compiler-cli/src/ngtsc/logging';
import { ɵParsedMessage } from '@angular/localize';

import { DiagnosticHandlingStrategy } from '@angular/localize/src/tools/src/diagnostics';
import { checkDuplicateMessages } from '@angular/localize/src/tools/src/extract/duplicates';
import { MessageExtractor } from '@angular/localize/src/tools/src/extract/extraction';
import { TranslationSerializer } from '@angular/localize/src/tools/src/extract/translation_files/translation_serializer';
import { SimpleJsonTranslationSerializer } from '@angular/localize/src/tools/src/extract/translation_files/json_translation_serializer';
import { Xliff1TranslationSerializer } from '@angular/localize/src/tools/src/extract/translation_files/xliff1_translation_serializer';
import { Xliff2TranslationSerializer } from '@angular/localize/src/tools/src/extract/translation_files/xliff2_translation_serializer';
import { XmbTranslationSerializer } from '@angular/localize/src/tools/src/extract/translation_files/xmb_translation_serializer';
import { ExtractI18NOptions } from './schema';

export interface ExtractTranslationsOptions extends ExtractI18NOptions {
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
   * The logger to use for diagnostic messages.
   */
  logger: Logger;
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
  const extractor = new MessageExtractor(fs, <Logger>logger, {
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
    <DiagnosticHandlingStrategy>duplicateMessageHandling,
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
