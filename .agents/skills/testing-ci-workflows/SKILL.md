---
name: testing-ci-workflows
description: Test GitHub Actions CI and security workflow changes for the SecretStash Node package. Use when verifying workflow triggers, check results, local command parity, or security scan configuration.
---

# Testing CI Workflow Changes

Use this skill when a PR changes `.github/workflows/**` for `dniccum/secret-stash-node`.

## Devin Secrets Needed

- None for workflow-only verification.
- SecretStash API credentials are not required unless the workflow under test explicitly calls the SecretStash service.

## Setup

1. Inspect the PR diff and read the changed workflow files.
2. Read `package.json` to confirm each workflow command maps to an existing npm script.
3. Check PR status with the GitHub integration:
   - `git(action="pr_checks", repo="dniccum/secret-stash-node", pull_number=<PR>, wait_mode="none")`
4. Check PR comments for review comments or informational GitHub Advanced Security comments:
   - `git(action="view_pr", repo="dniccum/secret-stash-node", pull_number=<PR>)`

## Local Verification Commands

Run commands from the repo root or with `npm --prefix /path/to/repo` if your shell is not in the repo:

```bash
npm ci
npm run lint
npm run typecheck
npm test
```

Expected local evidence for a healthy run:

- `npm ci` exits `0` and reports `found 0 vulnerabilities` unless dependency changes intentionally introduce known audit findings.
- `npm run lint` exits `0`.
- `npm run typecheck` exits `0`.
- `npm test` exits `0` and reports all Jest suites/tests passing.

## GitHub Actions Assertions

For CI workflow PRs, verify exact check names from the PR status rather than relying only on file inspection.

Expected checks for the current Node CI/security setup:

- `Test and lint (18.x)` passes.
- `Test and lint (20.x)` passes.
- `Dependency audit` passes.
- `CodeQL` / `CodeQL analysis` passes when CodeQL is enabled for the repo.

Expected trigger/config evidence:

- CI workflow includes `push` and `pull_request` triggers for `main`.
- Security workflow includes `push` and `pull_request` triggers for `main`.
- Security workflow includes a scheduled scan, usually a weekly cron.
- Workflow commands use `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --audit-level=high`, and CodeQL JavaScript/TypeScript actions when applicable.

## Reporting

This repo has no browser UI for workflow-only changes, so do not record a desktop/browser video for shell-only verification. Attach a markdown test report with:

- PR check summary.
- Trigger/config evidence from the workflow files.
- Local command output summary, especially Jest totals.
- Any caveats, such as GitHub Advanced Security comments that are informational rather than failures.

When testing an open PR, post exactly one PR comment with the runtime testing results and link to the Devin session.
