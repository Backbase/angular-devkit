import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';

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
) {
  if (!expectedRootZipContentsDir) {
    expectedRootZipContentsDir = expectedZipContentsDir;
  }
  const entries = [];

  const zip = zipStream.pipe(unzipper.Parse({ forceStream: true }));

  for await (const entry of zip) {
    const type = entry.type;

    if (type === 'Directory') {
      // Ignore dirs
      entry.autodrain();
    } else if (entry.path.endsWith('.zip')) {
      const childZipEntries = await compareZipContents(
        entry,
        path.resolve(expectedZipContentsDir, entry.path),
        expectedRootZipContentsDir
      );
      entries.push(...childZipEntries);
    } else {
      entries.push(entry.path);
      await compareEntry(
        entry,
        expectedZipContentsDir,
        expectedRootZipContentsDir
      );
    }
  }

  return entries;
}

async function compareEntry(
  entry,
  expectedZipContentDir: string,
  expectedRootZipContentsDir: string
) {
  const expectedPath = path.resolve(expectedZipContentDir, entry.path);
  // For some reason trying to do the below with fs.promises causes the original
  // zip stream to stop emitting events so we only ever see the manifest.json entry
  // and no others...
  //
  // const expectedContent = await fs.promises.readFile(expectedPath).catch(error => {
  //   if (error.code === 'ENOENT') {
  //     fail(`Unexpected file in zip: ${entry.path}`);
  //   } else {
  //     throw error;
  //   }
  // });
  //
  // ...therefore using readFileSync for now:
  //
  const expectedContent = (function () {
    try {
      return fs.readFileSync(expectedPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        fail(
          `Unexpected file in zip: ${path.relative(
            expectedRootZipContentsDir,
            expectedPath
          )}`
        );
      } else {
        throw error;
      }
    }
  })();

  const actualContent: Buffer = await entry.buffer();

  if (isTextFile(entry.path)) {
    expect(actualContent.toString('utf8').trim()).toEqual(
      expectedContent.toString('utf8').trim()
    );
  } else {
    expect(actualContent).toEqual(expectedContent);
  }
}

function isTextFile(file: string) {
  // An heuristic implementation
  return ['js', 'json', 'html', 'css', 'xml', 'svg'].includes(
    path.extname(file).substr(1)
  );
}
