# OpenCS extension branding

The extension packages two assets from Kimia's OpenCS brand package:

| File | Consumer |
| --- | --- |
| `media/aalto-opencs-ide-marketplace.png` | The 256 × 256 PNG listing icon selected by `package.json`, and the README illustration. Works for VS Code Marketplace and Open VSX/VSCodium. |
| `media/aalto-opencs-ide.svg` | A 24 × 24 monochrome bracket-and-cursor symbol for the Activity Bar and assignment-handout view. VS Code applies the current theme colour to its silhouette. |

Source: [OpenCS platform PR #960](https://github.com/aalto-opencs/opencs-platform/pull/960),
commit `dd9733b09239acfc1d16b8ff28f5351f042364ba`:

- `opencs-ui/public/brand/plugin/vscode/vscode-icon-256.png` is copied unchanged.
- `opencs-ui/public/brand/logo/opencs-symbol_black.svg` supplies the SVG geometry.
  Its bracket and cursor are scaled uniformly into a 24px square with 2px vertical
  padding. The coloured badge and export metadata are omitted from this UI icon.

The shared export collection now belongs in the platform repo's top-level
`brand/`. Update only these selected copies when the brand changes; keep source
documents, alternate sizes, JetBrains exports and unused variants out of `media/`
because the release packager includes that directory in the VSIX.

The icon paths and extension identifier stay stable. The Marketplace banner uses
the brand's dark background, `#0B0B0C`. Packaging does not download the private
platform repository and does not require access to it.
