---
"@cosyte/cli": patch
---

Declare a Node range that matches the release lines this package is actually tested on. `engines.node`
narrows from `>=22.0.0` to `>=22.0.0 <26.0.0`, so the manifest no longer claims support for a Node
line nobody here has run.

Node 26 is supported upstream and sat inside the old open-ended range, while the test matrix exercises
22 and 24 only. Anyone installing on Node 26 was therefore running an untested combination, and would
have learned that from a crash rather than from the manifest. The claim narrows to the tested set
rather than the tested set being widened to the claim: each matrix cell is a required status check
whose name is fixed outside this repository, so adding a line is a change that has to start there.

- **The tested set is now stated in this repository.** The CI caller passes the Node majors
  explicitly instead of inheriting them from the shared pipeline's input default, so the set is
  readable and diffable here, with no change to which versions run or to any status-check name.
- **A guard fails the build when the two drift apart again.** It derives the Node lines upstream
  still supports from a release schedule committed beside it, at the run date, and reports any
  supported line the declared range admits but the matrix does not exercise, any matrix cell the
  range refuses, and any prose surface restating either one differently.
- **The prerequisite in the installation guide states the upper bound too**, so the published
  documentation and the published manifest cannot disagree about which runtimes are supported.
