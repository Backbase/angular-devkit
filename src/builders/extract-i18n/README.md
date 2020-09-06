# extract-i18n Angular Builder

Extracts i18n messages from $localize and merges it with the template i18n extracted messages.

This builder triggers extraction of template messages as well so that is not required to trigger template i18n extraction separatly.

## Builder options

See the [schema.json](./schema.json) file for the configuration options available.

## Usage
This builder can be used to replace the angular xi18n builder(`@angular-devkit/build-angular:extract-i18n`) since this builder supports extracting i18n messages from both `templates` and `.ts` files and outputs a single file containing the extracted messages.

This works on the built output so make sure you pass the build output as source.

You can replace the existing extract-i18n builder in `angular.json` with this one like below to use the inbuilt `ng xi18n` command.

Existing:
```
"extract-i18n": {
  "builder": "@angular-devkit/build-angular:extract-i18n",
  "options": {
    "browserTarget": "payments-app:build"
  }
},
```
Replaced:
```
"extract-i18n": {
  "builder": "@bb-cli/angular-devkit:extract-i18n",
  "options": {
    "browserTarget": "payments-app:build",
    "outputPath": "messages",
    "source": "dist/libs/*/esm5/**/*.js"
  }
},
```

Alternately you can add a specific build configuration in angular json like below.

```
"i18n-extract": {
  "builder": "@bb-cli/angular-devkit:extract-i18n",
  "options": {
    "browserTarget": "payments-app:build",
    "outputPath": "messages",
    "source": "dist/libs/*/esm5/**/*.js"
  }
},
```
This config can be executed using the command `ng run payments-app:i18n-extract`.

## Local development

Run `npm run generate:sources` in the repo root dir to generate the `schema.d.ts` file in this dir.

See the [root project README](../../../README.md) for build and test instructions.
