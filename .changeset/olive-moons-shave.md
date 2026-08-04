---
"@cosyte/cli": patch
---

Put the shipped documentation sidebar back on the canonical IA spine.

`docs-content/sidebars.json` declared two top-level categories that are not on the spine, **"MCP
server"** and **"Reference"**. The docs site lints the sidebar it receives from each package's
released `docs-content.tar.gz`, and in strict mode a non-canonical top-level label is an error, so
this package was failing that gate and holding up the whole site's deploy.

Both categories are removed and their pages are folded into categories this package already had, so
no page moved out of the navigation and none was orphaned:

- **`mcp`** (the MCP server, its registration steps and its tool list) and **`reference-commands`**
  (the man-page-style command reference) now sit under **Guides**, next to `guides-overview`. Both
  are task-oriented: what to run, and what comes back.
- **`limitations`** (what the CLI does and does not do, the per-(format, operation) support matrix,
  the PHI and HIPAA posture) now sits under **Core Concepts**, next to `concepts-archetype`. It is
  the mental model a reader needs before relying on the tool, not a recipe.

Top-level navigation is now `Overview` (the `intro` doc), `Installation`, `Quickstart`,
`Core Concepts`, `Guides`, `Troubleshooting`, in that order.

**"Reference" was NOT renamed to "API Reference".** That category is injected by the docs site's own
sidebar resolver when a package ships API-reference sources, and a hand-authored one is refused
outright rather than warned about. The resolver still inserts it in its canonical position, just
before `Troubleshooting`.

Verified against the site's own linter rather than by inspection, with the sidebar shipped in the
previous release as a negative control: that one produces two errors, and this one produces no
findings at all.

Documentation-artifact change only. No command, flag, exit code, diagnostic code or export moves,
and no page content was rewritten.
