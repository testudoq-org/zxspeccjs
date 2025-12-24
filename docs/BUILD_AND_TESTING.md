# Build and Testing

This document describes how to build, run, and test the ZX Spectrum emulator project.

Prerequisites
- Node.js 18+ and npm

Development server
- Start a local static server for development:

  npm run dev

Build
- Create a minified browser bundle:

  npm run build

  Outputs: dist/bundle.min.js

Testing
- Run unit tests with Vitest:

  npm test

- Run in watch mode during development:

  npm run test:watch

CI
- A GitHub Actions workflow is provided at .github/workflows/ci.yml which installs dependencies, runs tests, and builds the bundle on push/pull requests to main/master.

Notes
- Source files are ES6 modules in src/*.mjs. Rollup bundles these into an IIFE for browser usage.
- Tests live under test/*.mjs and use Vitest. Tests run in Node environment by default.
