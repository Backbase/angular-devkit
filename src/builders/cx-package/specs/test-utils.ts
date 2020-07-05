import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';

export const cxPackageBuilderName = '@backbase/angular-devkit:cx-package';
/**
 * Absolute path to the dir containing the project's package.json file.
 */
export const rootDir = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Verify that the given zip has the given content.
 *
 * @param zipFile Path to the zip file under test
 * @param expectedContentsDir Path to the root Dir of the exploded zip content
 */
export async function expectZipContents(
  zipFile: string,
  expectedContentsDir: string
) {
  const entries = await compareZipContents(
    fs.createReadStream(zipFile),
    expectedContentsDir
  );
  const expectedFileCount = await countFiles(expectedContentsDir);
  expect(entries.length).toEqual(expectedFileCount);
}

/**
 * Returns the number of files (excl. directories) in the given directory and
 * all sub-directories.
 *
 * @param dir Root directory to start counting files
 */
async function countFiles(dir: string) {
  return fs.promises
    .readdir(dir)
    .then((entries) =>
      Promise.all(
        entries.map(async (entry) => {
          const entryPath = path.resolve(dir, entry);
          const stat = await fs.promises.lstat(entryPath);
          if (stat.isDirectory()) {
            return await countFiles(entryPath);
          }
          return 1;
        })
      )
    )
    .then((fileCounts) => fileCounts.reduce((sum, next) => sum + next, 0));
}

async function compareZipContents(
  zipStream,
  expectedZipContentsDir: string,
  expectedRootZipContentsDir?: string
): Promise<string[]> {
  if (!expectedRootZipContentsDir) {
    expectedRootZipContentsDir = expectedZipContentsDir;
  }

  const zipParser = zipStream.pipe(unzipper.Parse());

  return new Promise((resolve, reject) => {
    const entries = [];

    // The 'finish' event can fire whilst we're awaiting the
    // async processing of an entry stream, so only resolve when
    // all entries have finished being processed, too:
    let finished = false;
    let processingEntries = 0;
    const resolveIfAppropriate = () => {
      if (finished && !processingEntries) {
        resolve(entries);
      }
    };

    zipParser
      .on('entry', async function (entry) {
        const type = entry.type;

        if (type === 'Directory') {
          // Ignore dirs
          entry.autodrain();
        } else if (entry.path.endsWith('.zip')) {
          ++processingEntries;
          const childZipEntries = await compareZipContents(
            entry,
            path.resolve(expectedZipContentsDir, entry.path),
            expectedRootZipContentsDir
          );
          entries.push(...childZipEntries);
          --processingEntries;
          resolveIfAppropriate();
        } else {
          ++processingEntries;
          entries.push(entry.path);
          await compareEntry(
            entry,
            expectedZipContentsDir,
            expectedRootZipContentsDir
          );
          --processingEntries;
          resolveIfAppropriate();
        }
      })
      .on('finish', () => {
        finished = true;
        resolveIfAppropriate();
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function compareEntry(
  entry,
  expectedZipContentDir: string,
  expectedRootZipContentsDir: string
) {
  const expectedPath = path.resolve(expectedZipContentDir, entry.path);
  try {
    const expectedContent = await fs.promises.readFile(expectedPath);
    const actualContent: Buffer = await entry.buffer();

    if (isTextFile(entry.path)) {
      expect(actualContent.toString('utf8').trim()).toEqual(
        expectedContent.toString('utf8').trim()
      );
    } else {
      expect(actualContent).toEqual(expectedContent);
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      const relativePath = path.relative(expectedRootZipContentsDir, expectedPath);
      fail(`Unexpected file in zip: ${relativePath}`);
    } else {
      throw error;
    }
  }
}

function isTextFile(file: string) {
  // An heuristic implementation
  return ['js', 'json', 'html', 'css', 'xml', 'svg'].includes(
    path.extname(file).substr(1)
  );
}
