const gulp = require('gulp');
const ts = require('gulp-typescript');
const merge = require('merge2');
const path = require('path');

gulp.task('default', function() {
  const tsProject = ts.createProject('tsconfig.lib.json');
  const dest = tsProject.options.outDir;
  const tsResult = tsProject.src()
    .pipe(tsProject());

  return merge([
    tsResult.dts.pipe(gulp.dest(dest)),
    tsResult.js.pipe(gulp.dest(dest)),
    gulp.src('./src/**/*.json').pipe(gulp.dest(path.resolve(dest, 'src'))),
    gulp.src('./package.json').pipe(gulp.dest(dest)),
  ]);
});
