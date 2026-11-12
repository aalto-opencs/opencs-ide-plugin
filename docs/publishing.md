# Publishing OpenCS

The `.github/workflows/publish.yml` workflow publishes only after a **new
`vMAJOR.MINOR.PATCH` tag is pushed**. The maintainer or AI prepares the version
and tag; the workflow never creates tags or bumps versions itself.
OpenCS and STLC++ follow the same release process.

Pushes to `main`, pull requests and manual workflow runs validate and package only.
There is no manual publishing input. Use the original tag run's failed-job retry
for release recovery.

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

1. Update `package.json` and `package-lock.json` together, for example with
   `npm version patch --no-git-tag-version`.
2. Add exactly one non-empty `## [MAJOR.MINOR.PATCH]` section to `CHANGELOG.md`
   for that version. An optional ` - YYYY-MM-DD` suffix is supported.
3. Merge the changes into `main` and wait for CI to pass.
4. Create and push a new tag on the tested merged commit. Replace `X.Y.Z` with
   the exact package version; do not reuse a published version or move a tag:

   ```sh
   git fetch origin main
   git tag -a vX.Y.Z origin/main -m "Release X.Y.Z"
   git push origin vX.Y.Z
   ```

A local tag alone does not start GitHub Actions; pushing it starts this sequence:

1. Validate that this is a newly created tag from a push event, the tag and package
   versions match, the lockfile agrees, the extension identity is correct, the
   package is not a preview, and the commit belongs to `main`.
2. Extract the matching changelog section, run the tests and build the VSIX.
   Missing, duplicate or empty changelog entries fail the build.
3. Create the GitHub Release for the tag, using the extracted changelog and
   attaching the tested VSIX.
4. After the GitHub Release succeeds, upload that same VSIX to Visual Studio
   Marketplace and Open VSX in separate jobs. A failed validation, test, build
   or GitHub Release prevents both marketplace jobs from running.

The release build runs the extension tests and `npm run prepare:release`, then packages
the production `release/` directory with `--no-dependencies`.

The **opencs-vsix** artifact contains `extension.vsix` and `release-notes.md`.
The GitHub Release and both marketplaces use this build's artifact without
rebuilding it. Only the GitHub Release job has `contents: write`; only the
marketplace jobs have `id-token: write`. Marketplace jobs install locked tools
with lifecycle scripts disabled and use the `marketplace` environment, restricted
to `v*` tags.

## Dry runs and retries

A manual run is always a build-only check, even if a tag is selected:

```sh
gh workflow run publish.yml --repo aalto-opencs/opencs-ide-plugin --ref main
```

To recover a failed tag release, open the original **Build and publish** run in
GitHub Actions and choose **Re-run failed jobs**. The tag event and its validated
version remain the release trigger. If just one marketplace failed, its retry
uses the original tested artifact; leave the successful marketplace job alone.

Existing marketplace versions deliberately fail instead of silently skipping.
Do not use a new manual run to republish an existing release, move a tag, or upload
different bytes under the same version. For a code fix or an expired artifact,
prepare a new version and tag.

## Local checks

```sh
node --test tests/release/*.test.mjs
node scripts/release-notes.mjs
```

Run `./scripts/prepare-release.sh` to create the production VSIX locally.
These local checks do not publish. Live OIDC authentication is exercised by the
new-tag release workflow after the registry policies are configured.
