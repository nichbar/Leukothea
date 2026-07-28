# Build from sources

The build scripts are designed to run on a Unix platform (Linux, macOS, BSD, etc.). If you are on Windows, try installing [Cygwin](https://www.cygwin.com/).

## Prerequisites

- AMD64 platform. ARM platform is currently not tested, so the build may fail there
- UNIX-like OS
- make installed
- Docker installed (only required for the full `make build` path that runs packaging in a container)

If you have an ARM CPU and want to build the code, you can emulate AMD64 and run the build there. You may also try to [enable emulation](https://stackoverflow.com/questions/65612411/forcing-docker-to-use-linux-amd64-platform-by-default-on-macos) at the Docker level. If you use Docker, set the variable `export DOCKER_DEFAULT_PLATFORM=linux/amd64` or add the option `platform: linux/amd64` to a `docker-compose.yml` file.

## Build

- Create a `.env` file. You may copy the `.env.example` file and configure it with your options
- Run `make build` to build the whole project, package it, and check it with a linter
- Artifacts will be placed in the `build` directory


## Partial build

CI and `make build` pack Chromium only. For a specific browser target, run `make` with `buildChromium` or `buildChrome` (see `makefile` for details). Targets:
- chromium: default release target (auto updates not from the Google Store)
- chrome: Chrome Web Store variant (local builds)

Install dependencies first with `make prepare` (or `npm install`), then build a target.

Example command to build only the Chromium version: `make prepare buildChromium`.


# Development

You may run development mode with `make dev`.

If you change theme tokens, you also have to compile the theme files: `npm run build:tokens`

To debug on Android, [see instructions](./AndroidDebug.md).

To make a custom translator, see the [translator API](../CustomTranslator.md).

# Tests

When you change code that touches any user data and interacts with browser storages (`localStorage`, `indexedDB`, `browser.storage`, etc.) or some external API, you must add or update tests for it.

The general rule is that any code which simply transforms data should be tested.

You may not need to add tests for UI, but you should add tests for data.

# Migrations

Migrations must have app version.
