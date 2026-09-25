# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). Changesets drives
the **version bump** and **publish** for `@cosyte/cli`; the human-readable release notes live in
`CHANGELOG.md` (`changelog` generation is disabled in `config.json`).

Add a changeset for every meaningful change:

```bash
pnpm changeset
```

While the version is below 1.0, pick **minor** for a breaking change (a renamed or removed command,
flag, output field, exit code or diagnostic code) and call the break out in the changeset and in
`CHANGELOG.md`; new capability ships in a minor too. Pick **patch** for a fix that changes no
output.
