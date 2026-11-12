# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump**, the **publish**, and the **release section in `CHANGELOG.md`** for
`@cosyte/cli`: `config.json` names a `changelog` generator, so a release writes its own version
heading there from the changesets it consumed. So **the changeset summary is the changelog entry**.
Write it there and do not hand-edit `CHANGELOG.md`, whose sections above
`## Released before this file was generated` are generated output.

- **The first sentence becomes the public release bullet**, so make it stand on its own, say what
  changed for someone who runs `cosyte`, and keep internal identifiers out of it.
- **Never open a summary line at column 0 with a `#` heading.** Continuation lines are indented
  under the entry's bullet, so a heading would render inside the published release section. Use an
  inline code span instead.

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

While the version is below 1.0, every release is a **patch**, including a breaking change (a renamed or removed command,
flag, output field, exit code or diagnostic code) and new capability. Call a break out in the
changeset: say what changed and what a caller must do.
