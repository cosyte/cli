---
"@cosyte/cli": patch
---

The PHI scanner's all-mode walk now covers this package's whole authored corpus. It was rooted at
`test/__fixtures__` and `src` only, so 89 of 123 tracked files were scanned by neither of its two
routes; it now roots at `src`, `test` and `scripts`, opening 72 tracked files instead of 34.

Measured back to back on the base commit rather than inferred: a dashed SSN and an off-domain address
written into a file under `test/`, in this package's own inline-message shape (a whole HL7 message as
one TypeScript string literal with escape sequences between its segments), exited 0 with `OK, no
hits` in all mode while naming the same file explicitly reported both at exit 1 over the same bytes.
A file written under `scripts/` behaved identically. Both routes now report both. Every one of the 38
newly opened files was read by hand: every message literal is a placeholder and the only SSN and
email shapes anywhere are the scanner's own declared synthetic payload, so the gap was one of
enumeration rather than a live exposure.

`test` replaces `test/__fixtures__` rather than joining it, because the roots must stay disjoint: each
is walked independently and the results concatenated, so a nested root would enumerate every file
beneath it twice. The fixture directory is still watched, through the other condition of the
unobserved-root rule, wherever the repository tracks files under it. One cover was lost and is stated
rather than implied away: where nothing is tracked under it, an empty fixture directory no longer
refuses. `scripts/` is included because the scanner, its allow-list and its override log all live
there, so the one directory guaranteed to hold identifier-shaped text was the one nothing enumerated;
all nine files there were measured against the detector before the root was declared.

Scanning `scripts/` has one consequence worth knowing before it surprises someone: the allow-list
documents an id entry as matching a social-security, medical-record or member-id shape, and the
dashed-id check consults no allow-list, so declaring one in the dashed shape now reports a hit on the
allow-list itself. Nothing shipped is affected, and the remedy is to write the synthetic id in a shape
the check does not match, never to weaken the check or to exempt the file.

The scanner's own test file carries violator literals on purpose and is the single exempt path. That
exemption is applied after the file is read, so it still counts as observed and an unreadable one
still refuses; it is scoped to the sweep, so naming the file explicitly still reports every hit; and
it is per path rather than a pattern.

What this does not change: the detector is still the cross-cutting SSN and email floor, now over 38
more files, and structured field-level detection remains unimplemented. A test pins that limit.
`--staged` is unchanged, because widening it would change what a commit is blocked on.
