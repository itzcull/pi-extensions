# Pi Extensions

Personal [Pi](https://pi.dev) extensions maintained as independently installable packages.

This repository uses a pnpm workspace. Each directory under `packages/` is a separate npm package with its own version and Pi manifest. The first package will be `@itzcull/pi-gateway`.

## Prerequisites

- Node.js 22.19 or newer
- pnpm 11.20.0
- Pi

## Setup

```bash
pnpm install
pnpm check
```

The root commands run the corresponding script in every package that defines it:

```bash
pnpm typecheck
pnpm test
pnpm pack:check
pnpm check
```

Run a command for one extension with a package filter:

```bash
pnpm --filter @itzcull/pi-gateway check
```

## Package contract

Every extension lives in `packages/<name>/` and is independently installable. A package owns its source, tests, documentation, runtime dependencies, and version.

```text
packages/pi-gateway/
├── extensions/
│   └── index.ts
├── test/
├── package.json
├── README.md
└── tsconfig.json
```

Package manifests must:

- use the `@itzcull/pi-<name>` naming convention;
- include the `pi-package` keyword;
- declare extension entry points under `pi.extensions`;
- publish only required source and documentation through `files`;
- declare third-party runtime packages in `dependencies`;
- declare imported Pi core packages in `peerDependencies` with a `"*"` range; and
- expose `typecheck`, `test`, `pack:check`, and `check` scripts.

The shared [`tsconfig.base.json`](./tsconfig.base.json) is authoritative for TypeScript compiler defaults. Package configurations should extend it and limit `include` to their own source and tests.

See the authoritative Pi documentation for [packages](https://pi.dev/docs/latest/packages) and [extensions](https://pi.dev/docs/latest/extensions).

## Use an extension locally

Temporarily load an extension while developing it:

```bash
pi -e ./packages/pi-gateway
```

Install it into the active user's Pi settings using an absolute path:

```bash
pi install "$PWD/packages/pi-gateway"
```

To install it only for the current project, add `-l`:

```bash
pi install -l "$PWD/packages/pi-gateway"
```

Local path installations reference this checkout directly, so source changes do not need republishing. Extensions in package locations are reloaded according to Pi's package loading behavior.

## Verify and publish a package

Inspect the exact npm package contents before publishing:

```bash
pnpm --filter @itzcull/pi-gateway pack --dry-run
```

Exercise the npm publication lifecycle without uploading:

```bash
pnpm --filter @itzcull/pi-gateway publish --dry-run --access public
```

Publish after the package checks pass and its version has been updated:

```bash
pnpm --filter @itzcull/pi-gateway check
pnpm --filter @itzcull/pi-gateway publish --access public
```

Consumers can then install that extension independently:

```bash
pi install npm:@itzcull/pi-gateway
```

Pi packages run with the user's full system access. Review package contents before installing third-party extensions.
