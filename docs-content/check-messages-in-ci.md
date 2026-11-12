---
id: check-messages-in-ci
title: Check a folder of messages in CI
sidebar_label: Check messages in CI
description: "Build a script that validates every message in a folder, watch it catch an invalid resource and a file it cannot read, and run it in CI."
---

# Check a folder of messages in CI

In this tutorial you build a small script that validates every file in a folder of sample messages,
watch it catch an invalid FHIR resource and a file that is not a message, and run it as a CI step.
By the end you have a gate that fails a build when a message in the repository stops being valid.

You need the `cosyte` command (see [Installation](./installation.md)) and bash. Work in an empty
directory.

## 1. Make a folder of messages

Write two synthetic messages: an HL7 v2 admit and a FHIR Patient.

```bash
mkdir -p messages
printf 'MSH|^~\\&|SENDINGAPP|SENDINGFAC|RECEIVINGAPP|RECEIVINGFAC|20240101120000||ADT^A01|MSG00001|P|2.5\rEVN|A01|20240101120000\rPID|1||MRN-000123^^^HOSP^MR||ZZSENTINELLAST^ZZSENTINELFIRST^M||19800101|M\rPV1|1|I|WARD^101^A\r' > messages/admit.hl7
echo '{"resourceType":"Patient","id":"example","gender":"female"}' > messages/patient.json
```

## 2. Validate one file and read its exit code

`cosyte validate` prints its findings on stderr and puts the verdict in the exit code. With
`--quiet` it prints nothing when the file is valid, and the exit code is the whole answer:

```bash
cosyte validate messages/patient.json --quiet; echo "exit $?"
```

```text
exit 0
```

## 3. Write the script

The script validates each file in the folder it is given, prints one line per file, and exits `1`
if any file is not valid:

```bash
cat > check-messages.sh <<'EOF'
#!/usr/bin/env bash
# Validate every file in the folder named as the first argument.
# Exit 0 when every file is valid, 1 when any is not.
failed=0
for file in "$1"/*; do
  cosyte validate "$file" --quiet
  code=$?
  case $code in
    0) echo "valid    $file" ;;
    1) echo "invalid  $file"; failed=1 ;;
    *) echo "error    $file (exit $code)"; failed=1 ;;
  esac
done
exit $failed
EOF
chmod +x check-messages.sh
```

It tells two failures apart. Exit `1` means `cosyte` read the file and the message is invalid. Any
other non-zero code means it could not check the file at all; the
[exit-code table](./reference-commands.md#exit-codes) says which code means what.

Run it:

```bash
./check-messages.sh messages; echo "exit $?"
```

```text
valid    messages/admit.hl7
valid    messages/patient.json
exit 0
```

## 4. Watch it catch an invalid resource

Add a FHIR Observation whose `status` is not one of the codes FHIR allows, and run the script again:

```bash
echo '{"resourceType":"Observation","id":"example","status":"done","code":{"text":"Synthetic test"}}' > messages/result.json
./check-messages.sh messages; echo "exit $?"
```

```text
valid    messages/admit.hl7
valid    messages/patient.json
invalid  messages/result.json
exit 1
```

To see why, validate that file without `--quiet`:

```bash
cosyte validate messages/result.json; echo "exit $?"
```

```text
cosyte: validate: error CODE_INVALID at Observation.status
cosyte: validate: fhir is INVALID (1 error(s), 0 other finding(s))
exit 1
```

The finding gives the code and the path, never the value, so it is safe to leave in a CI log.

## 5. Watch it catch a file that is not a message

Fix the Observation, then add a file that is not a message at all:

```bash
echo '{"resourceType":"Observation","id":"example","status":"final","code":{"text":"Synthetic test"}}' > messages/result.json
echo 'not a message' > messages/notes.txt
./check-messages.sh messages; echo "exit $?"
```

```text
valid    messages/admit.hl7
cosyte: CLI_FORMAT_UNDETECTED: could not detect the input format; re-run with --format (detectable: hl7, mllp, fhir, x12, astm, ccda, ncpdp, dicom)
error    messages/notes.txt (exit 65)
valid    messages/patient.json
valid    messages/result.json
exit 1
```

`--quiet` hides the summary of a successful check, never a diagnostic: the `CLI_FORMAT_UNDETECTED`
line still reaches stderr. `cosyte` does not guess a format, so the file fails with the data-error
exit, `65`, and the script reports it. Remove it and the folder passes again:

```bash
rm messages/notes.txt
./check-messages.sh messages; echo "exit $?"
```

```text
valid    messages/admit.hl7
valid    messages/patient.json
valid    messages/result.json
exit 0
```

## 6. Run it in CI

Commit the folder and the script, and add a step that installs the command and runs the script. In
GitHub Actions:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "22"
- run: npm install -g @cosyte/cli
- run: ./check-messages.sh messages
```

The step fails when the script exits non-zero, so the build fails on the first invalid message.

## What you built

A gate that validates every message in a folder, tells an invalid message from a file it could not
check, and keeps values out of the log. The same pattern works with `cosyte parse` or
`cosyte inspect` in place of `validate`.

## Next

- [Branch on the exit code in a script](./branch-on-exit-codes.md): the exit codes to handle, in
  more detail.
- [Debug a rejected message](./debug-a-rejected-message.md): what to do when a file exits `65`.
- [How the CLI works](./how-the-cli-works.md#the-exit-code-contract): why the exit code is the
  contract.
