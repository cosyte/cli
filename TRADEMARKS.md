# Trademarks

`@cosyte/cli` is an independent open-source project. Cosyte is **not affiliated with, endorsed by,
or sponsored by** any standards body or company named in this repository or its documentation.

## Why these names appear

This command reads and writes messages in published healthcare data standards, and it cannot say
which formats it handles without naming them. Its docs also name code systems it does not bundle,
and one MCP client.

Every reference is **descriptive**: it identifies a standard, a code system, or a product, and
nothing more. Naming a standard is the only way to say whether a tool works with it.

## Names referenced

| Name             | Owner                                           | Where it appears                                           |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| HL7, FHIR, C-CDA | Health Level Seven International                | Formats the `cosyte` command works with                    |
| X12              | X12 (Accredited Standards Committee X12)        | A format the `cosyte` command works with                   |
| NCPDP            | National Council for Prescription Drug Programs | A format the `cosyte` command works with                   |
| DICOM            | National Electrical Manufacturers Association   | A format the `cosyte` command works with                   |
| ASTM             | ASTM International                              | A format the `cosyte` command works with                   |
| SNOMED CT        | SNOMED International                            | Named in the docs as a code system the CLI does not bundle |
| LOINC            | Regenstrief Institute                           | Named in the docs as a code system the CLI does not bundle |
| CPT              | American Medical Association                    | Named in the docs as a code system the CLI does not bundle |
| Claude Desktop   | Anthropic                                       | Named in the docs as an example MCP client                 |

All product names, logos, and brands are the property of their respective owners. Use of a name here
does not imply any affiliation with, or endorsement by, its owner. If you own one of these marks and
would like a reference changed, please open an issue.
