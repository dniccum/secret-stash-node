---
name: testing-ci-workflows
description: Test GitHub Actions CI, security, and npm publish workflow changes for the SecretStash Node package. Use when verifying workflow triggers, check results, local command parity, security scan configuration, or npm publish setup.
---

# Testing CI Workflow Changes

Use this skill when a PR changes `.github/workflows/**` for `dniccum/secret-stash-node`.

## Devin Secrets Needed

- None for workflow-only verification.
- SecretStash API credentials are not required unless the workflow under test explicitly calls the SecretStash service.
- `NPM_TOKEN` is a GitHub repo secret (not a Devin secret) — needed only for actual npm publish. Local testing does not require it.

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

## npm Publish Workflow Verification

When testing changes to the publish workflow (`.github/workflows/publish.yml`):

### Package Config Checks
- Verify `package.json` `name` field matches the intended scoped package (currently `@secret-stash/cli`)
- Verify `publishConfig.access` is `"public"` (required for scoped packages on npm)
- Verify `repository` field is present

### Build & Pack Checks
```bash
npm run build          # Should exit 0, produce dist/index.js and dist/index.d.ts
npm pack --dry-run     # Should show correct tarball name and only dist/ files
```
- Tarball name should match the scoped package name (e.g., `secret-stash-cli-X.Y.Z.tgz`)
- No `src/`, `__tests__/`, or `node_modules/` should appear in the pack output

### Version Sync Simulation
```bash
npm version "1.2.3" --no-git-tag-version --allow-same-version
```
- Should exit 0 and update `package.json` version to `1.2.3`
- Should NOT create a git tag
- Restore afterward: `git checkout package.json`

### Workflow YAML Structure
Parse with Node.js `js-yaml` (already available as a transitive dependency or install with `npm install --no-save js-yaml`):
- Trigger should be `release.types: [published]`
- `registry-url` should be `https://registry.npmjs.org`
- `NODE_AUTH_TOKEN` should reference `${{ secrets.NPM_TOKEN }}`
- Lint, typecheck, and test steps must appear BEFORE the publish step (quality gate)
- Version update step should use `${GITHUB_REF_NAME#v}` to strip the `v` prefix from tags

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
- npm pack and version sync results when testing publish workflow.
- Any caveats, such as GitHub Advanced Security comments that are informational rather than failures.

When testing an open PR, post exactly one PR comment with the runtime testing results and link to the Devin session.
