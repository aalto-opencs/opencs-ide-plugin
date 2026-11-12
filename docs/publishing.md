# Publishing OpenCS

The `.github/workflows/publish.yml` workflow builds one VSIX and publishes it
to Visual Studio Marketplace and Open VSX on a `vMAJOR.MINOR.PATCH` tag push.
Pull requests validate and package without publishing.
**Run workflow** is also a packaging-only dry run, even when a tag is selected.

## One-time setup

Merge this workflow before registering it with the registries. In this GitHub
repository, create an environment named **marketplace** under Settings →
Environments. Set its deployment branches and tags to **Selected branches and
tags**, and allow **tags matching `v*`**. Both registries must pin that environment.
The workflow also checks that the tagged commit already belongs to `main`.

Configure these registrations separately; authorization in one registry does
not authorize the other.

### Visual Studio Marketplace

Open [aalto-opencs → Trusted publishing](https://marketplace.visualstudio.com/manage/publishers/aalto-opencs/trustedpublishing)
and create a policy:

| Field | Value |
| --- | --- |
| Policy name | OpenCS extension releases |
| Provider | GitHub Actions |
| Repository owner | `aalto-opencs` |
| Repository | `opencs-ide-plugin` |
| Workflow | `publish.yml` |
| Environment | `marketplace` |

The workflow uses the locked `@vscode/vsce` CLI with `publish --oidc`.
See [Microsoft's setup guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing).

### Open VSX

Open [Settings → Trusted Publishers](https://open-vsx.org/user-settings/trusted-publishers),
select namespace `aalto-opencs` and extension `aalto-opencs-ide`, and register:

| Field | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or User name | `aalto-opencs` |
| Repository name | `opencs-ide-plugin` |
| Workflow filename | `publish.yml` |
| Environment name | `marketplace` |

The registering account must own the namespace and have signed the Publisher
Agreement. Open VSX requires at least one active version before registration;
this extension already has one. The workflow uses the locked `ovsx` CLI with
`publish --trusted-publishing`. See the
[Open VSX setup guide](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing).

No publishing PAT secret is required. Do not inject `OVSX_PAT` into the job:
Open VSX gives a PAT precedence over trusted publishing.

## Release procedure

1. Merge the changes to release, including any branding updates.
2. Update `package.json` and `package-lock.json` together, for example with
   `npm version patch --no-git-tag-version`. Use a new version in both registries,
   update the changelog, and merge the version change into `main`.
3. Wait for the repository's CI checks to pass.
4. Tag that merged commit with exactly `v` followed by the package version, and
   push the tag to `origin`.

The release gate rejects a mismatched version, a stale lockfile, an unexpected
extension identity, a preview package, or a commit outside `main`.
The build runs the extension tests and `npm run prepare:release`, then packages
the prepared `release/` directory with `--no-dependencies`. This uses the
Marketplace README and excludes development settings and tools.

Both registries receive the same `extension.vsix` from the **opencs-vsix**
artifact. Only the two publishing jobs have `id-token: write`; they install
locked dependencies with lifecycle scripts disabled and upload the existing
VSIX without rebuilding it.

## Retry and local checks

The registries run in separate jobs. If only one fails, fix its policy or
service issue and use **Re-run failed jobs** to retry it with the original
artifact. Existing versions deliberately fail instead of silently skipping;
do not move a release tag or reuse a version to ship different bytes. For a
code fix or an expired artifact, prepare a new version.

Run the release-gate tests locally with:

```sh
node --test tests/release/*.test.mjs
```

Run `./scripts/prepare-release.sh` to create the production VSIX locally.
Neither local command publishes anything. Live OIDC authentication is exercised
only by an authorized tag run after the registry policies are configured.
