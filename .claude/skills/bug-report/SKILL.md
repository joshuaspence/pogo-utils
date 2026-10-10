---
name: 'bug-report'
description: >
  File a bug against `invoice-tool` as a GitHub issue, filled against the repository bug report form. Use when the user
  runs `/bug-report`, or asks to write up, file or report a bug or an issue for something that went wrong.
---

# Bug report

Turn a failure into an issue on `joshuaspence/invoice-tool`, filled against the repository's own bug report form.

An argument, when there is one, says which failure to write up -- it steers a session that holds more than one, and is
never the content of the report.

## Read the form first

Read `.github/ISSUE_TEMPLATE/bug_report.yaml`. It is the contract, and this document deliberately does not restate it:

- Each `body` entry carrying an `id` is one section of the issue body, and its `attributes.label` is that section's
  heading. Match the label exactly -- the heading is what a later search looks for.
- `validations.required: true`, and `options[].required: true` on a checkbox, mark what cannot go up empty. If you
  cannot fill a required section, ask; do not file around it.
- The top-level `labels` list is what the issue must be created with. `gh issue create` does not read this file, so a
  label that is not passed on the command line is a label the issue does not get.

Two paths reach the same issue -- the web form, and this skill -- and only the web form reads that YAML on its own.
Anything the form declares is invisible here unless you go and read it, which is why this step is first rather than
last.

## Gather

Take from the session what the session already holds. Ask only for what is not there.

| Section  | Where it comes from                                                                            |
| -------- | ---------------------------------------------------------------------------------------------- |
| Version  | `git rev-parse --short HEAD` in the checkout the failure happened in. There is no `--version`. |
| Command  | The invocation as it was actually run, including the flags.                                    |
| Merchant | The recipe involved, or empty when the bug is in the engine rather than in one merchant.       |
| Expected | What the run should have done. Ask when the session never said.                                |
| Actual   | What it did instead.                                                                           |
| Output   | What the run printed. `--debug` adds a stack trace, if the failure is still reproducible.      |

Invoked cold, with no failure in scope, interview for each section in one round rather than one question at a time.

## Redact

The repository is public and the output was captured from a real run. Before showing anything, scan it and replace:

- `key: value` and `key=value` pairs whose key holds token, secret, password, cookie, authorization, bearer, api-key or
  session
- JWTs -- anything starting `eyJ`
- `Set-Cookie:` lines, whole
- Prefixed tokens: `ghp_`, `gho_`, `github_pat_`, `sk-ant-`, `AKIA`, `ASIA`
- Signed URL query strings: `X-Amz-Signature`, `X-Amz-Credential`, and any `token=` parameter

Leave alone, because they authenticate nothing and are the evidence the report exists to carry: SHA-256 digests, invoice
and order numbers, merchant names, dates, filenames and the `Identified` flag. Abbreviate a home directory to `~` as
tidiness rather than as secrecy. Leave email addresses; the author's is in every commit already.

Where a string is ambiguous, redact it. Then say in the summary what was redacted and where, so the user approves a
redaction rather than discovering one -- over-redacting costs a line pasted back, and under-redacting puts a live
credential on a public repository.

## Confirm

Draft a title that describes the defect rather than the fix, in the voice the repository's commit subjects use --
`Woolworths reports success over an empty ledger`. No `[bug]` prefix: the label already says it.

Search for what is already filed, and show any hits above the body rather than judging them:

```bash
gh issue list --search '<keywords from the title>' --state all --limit 10
```

Then show the rendered body, the title, the label, and what was redacted. Wait. Do not create anything until the user
says to.

## Create

Write the body to a file outside the working tree -- the session scratchpad -- so an abandoned run leaves nothing behind
for a later `git add` to pick up. Then:

```bash
gh issue create --title '<title>' --label '<each label from the form>' --body-file '<path>'
```

Print the URL it returns, and stop. Do not open a browser, and do not comment `@claude` on the issue: the mention
workflow gates on `github.event.issue.pull_request`, so a mention on an issue reaches nobody.
