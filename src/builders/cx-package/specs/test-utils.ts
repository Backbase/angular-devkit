import * as fs from 'fs';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { Volume } from 'memfs/lib/volume';
import * as glob from 'glob';

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
export function expectZipContents(
  zipFile: string,
  expectedContentsDir: string
): void {
  describe('the generated zip file', () => {
    const vfs = new Volume();
    let expectedFileCount = 0;
    let actualFileCount: number;

    afterAll(() => {
      vfs.reset();
    });

    beforeAll(async () => {
      actualFileCount = await recursivelyExplodeZip(
        fs.createReadStream(zipFile),
        vfs
      );
    });

    // Need to use glob.sync as describe functions cannot be async
    glob
      .sync('**/*', {
        cwd: expectedContentsDir,
        nodir: true,
      })
      .forEach((file) => {
        ++expectedFileCount;
        const expectedFilePath = path.resolve(expectedContentsDir, file);
        it(`should contain the file ${file} containing the same content as ${expectedFilePath}`, async () => {
          const expectedContent = await fs.promises.readFile(expectedFilePath);
          const actualContent = await vfs.promises
            .readFile(path.resolve('/', file))
            .catch((error) => {
              if (error.code === 'ENOENT') {
                return undefined;
              }
              throw error;
            });
          if (actualContent === undefined) {
            fail(`File ${file} missing in pacakged zip`);
          } else if (isTextFile(file)) {
            // IDEs/editors may force trailing new lines in expected text files
            expect(actualContent.toString('utf8').trim()).toEqual(
              expectedContent.toString('utf8').trim()
            );
          } else {
            expect(actualContent).toEqual(expectedContent);
          }
        });
      });

    it(`should contain no more than the ${expectedFileCount} files expected`, () => {
      expect(actualFileCount).toEqual(expectedFileCount);
    });
  });
}

async function recursivelyExplodeZip(
  zipStream,
  vfs: Volume,
  rootDir = '/'
): Promise<number> {
  const zipParser = zipStream.pipe(unzipper.Parse());

  return new Promise((resolve, reject) => {
    let entries = 0;

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
        ++processingEntries;
        const type = entry.type;
        const fullPath = path.resolve(rootDir, entry.path);
        if (type === 'Directory') {
          await vfs.promises.mkdir(fullPath, { recursive: true });
          entry.autodrain();
        } else if (entry.path.endsWith('.zip')) {
          await vfs.promises.mkdir(fullPath, { recursive: true });
          entries += await recursivelyExplodeZip(entry, vfs, fullPath);
        } else {
          ++entries;
          await vfs.promises.writeFile(fullPath, await entry.buffer());
        }
        --processingEntries;
        resolveIfAppropriate();
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

function isTextFile(file: string) {
  // An heuristic implementation
  return ['js', 'json', 'html', 'css', 'xml', 'svg', 'hbs'].includes(
    path.extname(file).substr(1)
  );
}
