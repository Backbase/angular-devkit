# @backbase/angular-devkit

A collection of Angular dev tools for Backbase projects.

Run `npm run generate:sources` after checking out this project to generate some required source files 
(`npm run build` does this automatically).

Use `npm run build` to build the project using [gulp](https://gulpjs.com/).
The build result is output to `/dist`.  
See `gulpfile.js` for the build process.

Run `npm run test` to execute tests using [jest](https://jestjs.io/).
Coverage reports are output to `/coverage`.

## Builders

The following [Angular Builders](https://angular.io/guide/cli-builder) are included:

* [`cx-package`](./src/builders/cx-package) Used to build a CX-deployable zip-of-zips
