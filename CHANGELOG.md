# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-12-28

### Changed

- **Upgraded to ESLint 9**: Migrated from ESLint 8 to ESLint 9.39.2 with modern flat config format (`eslint.config.mjs`)
- **Upgraded TypeScript ESLint**: Updated `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` from 6.x to 8.50.1
- **Removed eslint-config-standard**: Removed old `eslint-config-standard` and related plugins (incompatible with ESLint 9), now using `@eslint/js` and `typescript-eslint` directly
- **Updated TypeScript**: Upgraded from 5.2.0 to 5.9.3
- **Updated Jest**: Upgraded from 29.7.0 to 30.2.0
- **Updated @types/jest**: Upgraded from 29.5.13 to 30.0.0
- **Updated @types/node**: Upgraded from 20.x to 25.0.3
- **Updated ts-jest**: Upgraded from 29.2.5 to 29.4.6
- **Updated @langchain/langgraph-checkpoint**: Upgraded from 0.1.1 to 1.0.0
- **Updated Node.js engines**: Changed from `>=22` to `>=18` to support Node 18, 20, and 22

### Added

- **GitHub Actions Workflows**: Added modern CI/CD workflows
  - `ci.yml`: Continuous integration testing on Node.js 18, 20, and 22
  - `publish-npm.yml`: Automated NPM publishing with OIDC trusted publishing (no tokens needed)
- **CHANGELOG.md**: Added this changelog file to track version history

### Fixed

- Security vulnerabilities resolved by upgrading dependencies
