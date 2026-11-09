# AiSphere application specification schemas

JSON Schema (Draft 2020-12) for AiSphere application catalog entries and the
files written by Explore > Export.

| File | Purpose |
| --- | --- |
| `application-spec.schema.json` | One portable application specification (metadata, requirements, runtime, installation, workspace component, lifecycle hooks). |
| `installed-application.schema.json` | Persisted installed-application record: a specification plus machine-local `install`, `task`, `apphomedir`, `status`, `error`, and `lanNasConfig` state. |
| `app-catalog.schema.json` | Combined export: `{ "$schema": ".../app-catalog.schema.json", schema: "aisphere.app-catalog", version: 1, apps: [...] }`. |
| `app-spec-export.schema.json` | Single-app export: `{ "$schema": ".../app-spec-export.schema.json", schema: "aisphere.app-spec", version: 1, app: {...} }`. |

The schemas are shipped with the app because `electron-builder.yml` copies the
whole `resources` directory to `process.resourcesPath`.

Explore > Export writes `$schema` on each file, pointing at the matching wrapper
schema, so editors and CI can discover validation rules from the file itself.
Exports contain portable specifications only; per-machine runtime state
(`install`, `task`, `status`, `error`, `apphomedir`) is removed on export and
ignored on import. Exports still keep the `schema` and `version` marker fields.

## Specification vs installed record

These are two different things and have separate schemas:

- A **specification** (`application-spec.schema.json`) is portable. It is what users
  share, import, and export. Its `id` is the catalog id.
- An **installed application** (`installed-application.schema.json`) is a
  persisted record. It extends the specification with machine-local state. Its
  `id` is the instance id, and `catalogId` links back to the specification.
  Legacy records may still use the catalog id as `id`; `catalogId` is therefore
  optional.

In TypeScript these map to `ApplicationSpec` and `InstalledApplication` in
`src/types/api.ts`, with `ExploreApplication` as the list view model (spec plus
optional installation state).

## Minimal specification

```json
{
  "$schema": "https://aisphere.dev/schemas/application-spec.schema.json",
  "specVersion": "1.0",
  "id": "app-example",
  "name": "Example App",
  "org": "Example Org",
  "version": "1.0.0",
  "description": "What the app does.",
  "category": "Tools",
  "type": "tool",
  "kind": "app",
  "runtime": { "runtime": "native" },
  "packages": [],
  "requirements": {
    "platform": "any",
    "cpu": "x64",
    "memory": "1GB RAM",
    "storage": "10MB",
    "gpu": "Not required"
  }
}
```

Only `id`, `name`, and `version` are required. Existing catalog entries remain
valid; fields that current builds normalize with defaults are optional here.

The `$id` values are stable schema identifiers. Until the schemas are published
on a public host, point `$schema` at the local file when validating offline.

## Metadata

| Field | Notes |
| --- | --- |
| `id` | Stable catalog ID (`app-006`, `mkt-app-009`, `builtin-lan-nas`). Installed instances store this in `catalogId`. |
| `name`, `description`, `category`, `version` | Display and catalog metadata. |
| `org` | Compatibility field used by current builds. |
| `author` | String or `{ name, email?, url? }`. New specs should prefer this. |
| `icon` | URL, data URI, or packaged path. Current builds render it directly as an image source. |
| `notes` | Longer Markdown notes or setup hints. |
| `url`, `homepage`, `license` | Project and license metadata. |
| `type` | `llm`, `tool`, `agent`, `dataset`, `other`. |
| `kind` | `engine`, `webui`, `agent`, `skill`, `hook`, `tool`, `instructions`, `mcp`, `app`. |
| `labels` | Search/filter labels. |
| `requirements` | `platform`, `cpu`, `memory`, `storage`, `gpu` plus optional `arch`. |

## Installation

The current runtime reads `runtime` and `packages`. The optional `installation`
object is a normalized, forward-looking description of the same strategy.

| Current fields | Meaning |
| --- | --- |
| `packages: []` | Files downloaded into the application home directory (models, archives, installers, `file://` URLs). |
| `runtime.runtime: "docker"` + `runtime.image` | Pull and run a container image. `options` are placed before the image, `args` after it. |
| `runtime.runtime: "podman"` / `"apptainer"` | Container runtime. A downloaded artifact may be loaded by the runtime. |
| `runtime.runtime: "conda"` + `runtime.install` | Conda package arguments. |
| `runtime.runtime: "native"` | Runs directly on the host; no installer is required. |
| `install.ps1`, `install.bat`, `install.sh` | Current builds auto-detect these in the application home directory after download and run them. |

`installation.method` may be `auto` (default, use current behavior),
`packages`, `container`, `script`, `native`, or `conda`. When
`method: "container"` an `image` is required; `method: "script"` requires a
`script` descriptor; `method: "packages"` requires `packages`.

The top-level `install` property is **not part of a specification**. It is
machine-local state on an installed record and is covered by
`installed-application.schema.json`. Do not add it to shared/exported specs.

## Lifecycle hooks

Use the `lifecycle` object. Each phase is an ordered array of actions.

```json
{
  "lifecycle": {
    "preInstall": [],
    "install": [],
    "postInstall": [
      {
        "id": "credentials",
        "type": "docker-log-credentials",
        "patterns": ["user", "password", "credential"],
        "tailLines": 200
      }
    ],
    "preStart": [],
    "starting": [],
    "postStart": [],
    "preStop": [],
    "stopping": [],
    "postStop": [],
    "preUninstall": [],
    "uninstalling": [],
    "postUninstall": []
  }
}
```

Additional camelCase phases are accepted (`preUpdate`, `update`, `postUpdate`,
`preRestart`, `restarting`, `postRestart`, and future names), so the schema does
not need a new release for every new phase.

### Current execution status

| Phase | Current AiSphere behavior |
| --- | --- |
| `postInstall` | Use the legacy `postInstallActions` field today. Current builds run it after a successful app start, and runtimes also use it after runtime installation. |
| `postStop` | Use the legacy `postStopActions` field today. |
| `postUninstall` | Use the legacy `postUnInstallActions` field today. It runs before the package directories are removed. |
| `preInstall`, `install`, `preStart`, `starting`, `postStart`, `preStop`, `stopping`, `preUninstall`, `uninstalling`, `preUpdate`, `update`, `postUpdate`, `preRestart`, `restarting`, `postRestart` | Reserved by this schema. Current builds do not execute these phases yet. |

The legacy top-level fields are still valid and are marked deprecated in the
schema:

- `postInstallActions` → `lifecycle.postInstall`
- `postStopActions` → `lifecycle.postStop`
- `postUnInstallActions` → `lifecycle.postUninstall`

To stay compatible with current builds, put actions that must run now in the
legacy fields. `postInstallActions` in the bundled File Browser NAS spec is the
canonical example.

### Action types

Known actions validate strictly:

- `docker-log-credentials` — `patterns` (required), `tailLines` (1..2000, default 200).
- `windows-firewall` — `operation` (`ensure`/`remove`), `port`, `ruleName`,
  `profile: "private"`, `remoteAddress: "localsubnet"`.

Unknown action `type` values are allowed structurally for forward
compatibility. Current builds log and skip unsupported actions rather than
failing the whole lifecycle.

Every action also accepts `id`, `type`, `description`, `continueOnError`,
`timeoutSeconds`, and `platforms` (`windows`, `linux`, `macos`).

## Workspace component

`component` describes what gets registered after installation. Only the section
matching `kind` is consumed.

```json
{
  "kind": "mcp",
  "component": {
    "server": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "tools": [{ "name": "get_issue", "description": "Get issue details" }]
    }
  }
}
```

`component.server` supports `stdio`, `http`, `sse`, and `local` transports.
`component.hooks` is for **workspace** events (`session-start`,
`message-send`, `assistant-reply`, `tool-call`) and is separate from the
application `lifecycle` hooks.

## Extension policy

- Unknown top-level properties are allowed and preserved by current import
  logic. This keeps older AiSphere builds from rejecting newer specs.
- Use the `extensions` object or an `x-` prefixed property for vendor data.
- Known actions are strict so typos are caught. New action types can be added
  without changing the schema.
- New lifecycle phases can use any camelCase name; the value is still validated
  as an action array.

## Validation

Use any Draft 2020-12 validator. With Ajv CLI 5:

```powershell
npx ajv-cli@5 validate --spec=draft2020 `
  -s resources/schema/application-spec.schema.json `
  -d app.json
```

For a combined catalog export, register the application schema as a referenced
schema:

```powershell
npx ajv-cli@5 validate --spec=draft2020 `
  -s resources/schema/app-catalog.schema.json `
  -r resources/schema/application-spec.schema.json `
  -d aisphere-apps-20260101-120000.json
```

Validate an installed record (for example `db/default/app.json` entries) against
the installed schema:

```powershell
npx ajv-cli@5 validate --spec=draft2020 `
  -s resources/schema/installed-application.schema.json `
  -r resources/schema/application-spec.schema.json `
  -d installed-app.json
```

The repository currently has Ajv 6 as a transitive dependency (Draft-07 only),
so use Ajv 8+/CLI 5 for Draft 2020-12 validation rather than the bundled copy.
