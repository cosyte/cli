import cosyte from "@cosyte/eslint-config";

// The examples are programs that print, not library code with a public API, so they are linted as
// an application: every type-safety rule applies, and `no-console` and the JSDoc gate do not.
export default cosyte(import.meta.dirname, { files: ["*.ts"], library: false });
