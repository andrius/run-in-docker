# CLAUDE.md

## Overview

A pair of GitHub Actions that start a Docker container (`start`) and execute
commands inside it (`exec`), with a `cleanup` step that stops the container at
job end. Purpose: build/test software on legacy OSes (e.g. Debian Jessie,
Stretch) as a workaround for container-job limitations after Actions moved to
Node 20. Own project.

## Tech stack

- Node.js Actions using `@actions/core` and `@actions/exec`.
- Bundled with `@vercel/ncc` into self-contained `index.js` outputs.

## Structure

- `start/` - starts the container (`action.yml`, `index.js`, `cleanup.js`).
- `exec/` - runs commands in the container (`action.yml`, `index.js`).
- `utils/` - shared helpers (`docker.js`).

## Commands

- `npm install`
- `npm run build` - `ncc` bundles start/exec/cleanup into distributable folders.

## Notes

- The host is reachable from the container as `host-gateway` /
  `host.docker.internal`; `GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_STEP_SUMMARY`
  are writable from inside the container.
- Committed `ncc` build output must be regenerated when source changes.
