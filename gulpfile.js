const gulp = require('gulp');
const ts = require('gulp-typescript');
const merge = require('merge2');
const path = require('path');
const { promisify } = require('util');
const rimraf = promisify(require('rimraf'));
const exec = require('child_process').exec;

function generateSources(cb) {
  exec('json2ts -i src/builders/cx-package/schema.json -o src/builders/cx-package/schema.d.ts', (err, stdout, stderr) => {
    stdout && console.log(stdout);
    stderr && console.error(stderr);
    cb(err);
  });
}

async function build() {
  const tsProject = ts.createProject('tsconfig.lib.json');
  const dest = tsProject.options.outDir;
  await rimraf(dest);
  const tsResult = tsProject.src()
    .pipe(tsProject());

  return merge([
    tsResult.dts.pipe(gulp.dest(dest)),
    tsResult.js.pipe(gulp.dest(dest)),
    gulp.src('./src/**/*.json').pipe(gulp.dest(path.resolve(dest, 'src'))),
    gulp.src('./package.json').pipe(gulp.dest(dest)),
  ]);
}

exports.generateSources = generateSources;
exports.default = gulp.series(generateSources, build);
