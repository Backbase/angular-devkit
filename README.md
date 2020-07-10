# @bb-cli/angular-devkit

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

### Testing builders

The builders have specs that run tests against some static resources in the
[test-resources](./test-resources) directory.

You can also test the builders against a real Angular project as follows:

* Run `npm run build` in this root directory to build the `@bb-cli/angular-devkit` package
* Run `cd dist && npm pack`
* Copy the `dist/bb-cli-angular-devkit-*.tgz` package to the root directory of your real Angular project.
* In your Angular project's root dir, run `npm i bb-cli-angular-devkit-*.tgz -D` to install the package as a dev dependency
* Edit your Angular project's angular.json to add an `architect` target for the builder to test.
  For example, to test the `cx-package` builder, you could add the following `package` target  
  to the `projects.my-project-name.architect` section:
  
```json
{
  "projects": {
    "my-project-name": {
      "architect": {

        "package": {
          "builder": "@bb-cli/angular-devkit:cx-package",
          "options": {
            "items": [
              {
                "type": "page",
                "name": "my-project-name-page",
                "entryFile": "projects/my-project-name/src/index.hbs",
                "icon": "projects/my-project-name/packaging/resources/page/icon.png",
                "builtSources": "dist/my-project-name",
                "modelXml": "projects/my-project-name/packaging/resources/page/model.xml"
              }
            ]
          }
        }

      }
    }
  }
}
``` 

You can then run the configured builder with `ng run my-project-name:package`.
