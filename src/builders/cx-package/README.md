# cx-package Angular Builder

Generates a CX zip-of-zips package.

This builder currently supports packaging one type of artifact: A CX6 Page.

## Builder options

See the [schema.json](./schema.json) file for the configuration options available.

Note that this builder does not invoke `ng build` - this must be done before using
this builder to create a CX package.

## Local development

Run `npm run generate:sources` in the repo root dir to generate the `schema.d.ts` file in this dir.

See the [root project README](../../../README.md) for build and test instructions.
