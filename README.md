[![npm version](https://img.shields.io/npm/v/@secret-stash/cli)](https://www.npmjs.com/package/@secret-stash/cli)
[![npm downloads](https://img.shields.io/npm/dm/@secret-stash/cli)](https://www.npmjs.com/package/@secret-stash/cli)
[![CI](https://github.com/dniccum/secret-stash-node/actions/workflows/ci.yml/badge.svg)](https://github.com/dniccum/secret-stash-node/actions/workflows/ci.yml)
[![Security](https://github.com/dniccum/secret-stash-node/actions/workflows/security.yml/badge.svg)](https://github.com/dniccum/secret-stash-node/actions/workflows/security.yml)
[![Publish to npm](https://github.com/dniccum/secret-stash-node/actions/workflows/publish.yml/badge.svg)](https://github.com/dniccum/secret-stash-node/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/npm/l/@secret-stash/cli)](LICENSE.md)

![SecretStash](og-image.png)

# SecretStash CLI (Node.js / NPM)

> Stop sharing `.env` files in Slack.

The SecretStash CLI for Node.js lets you securely sync environment variables across your team, applications, and environments—directly from your local workflow.

Built for developers who want a fast, secure, CLI-first way to manage secrets without friction.

A Node.js/TypeScript package for interacting with the [SecretStash](https://secretstash.cloud) REST API. This package can be used as a programmatic Node module within a project or installed globally as a CLI tool. It provides full zero-knowledge encryption support for managing your environment variables.

## Requirements

- Node.js 18 or higher
- A SecretStash API Key

---

## 🚀 Why SecretStash?

If you’ve ever:

- Shared `.env` files over Slack, email, or Notion
- Accidentally committed secrets to Git
- Struggled to keep environment variables in sync
- Wasted time onboarding teammates with config setup

👉 SecretStash solves this in minutes.

---

## ⚡ Quick Start (2 Minutes)

### 1. Install

```bash
npm install -g @secret-stash/cli
```

---

### 2. Authenticate

```bash
secret-stash login
```

---

### 3. Pull your environment variables

```bash
secret-stash pull
```

✅ Your `.env` file is now synced and secure.

---

## 🌐 Use with SecretStash Cloud

The CLI is designed to work with SecretStash Cloud:

👉 https://secretstash.cloud

With the cloud platform, you can:

- Manage applications and environments in one place
- Share secrets securely across your team
- Sync configs across machines instantly
- Eliminate insecure secret sharing

Start free — no credit card required.

---

## 🔐 Secure by Design

SecretStash uses **zero-knowledge encryption**:

- Secrets are encrypted locally before being sent
- Encryption keys remain on your machine
- SecretStash never sees your raw values

> Only you and your team can decrypt your secrets.

---

## ⚙️ How It Works

1. Store variables in SecretStash Cloud
2. Encrypt them locally
3. Sync via CLI across environments and machines

This creates a secure, consistent workflow from local development to production.

---

## 💡 Common Use Cases

### 👥 Team Collaboration
Keep everyone in sync without sharing `.env` files manually.

### 🌍 Environment Management
Separate configs for development, staging, and production.

### 🚀 Node.js Applications
Integrate directly into your existing Node workflow.

### 🔁 CI/CD Pipelines
Pull secrets securely during builds and deployments.

---

## 📦 Available Commands

```bash
secret-stash login   # Authenticate
secret-stash pull    # Pull environment variables
secret-stash push    # Push local changes
```

---

## 🧪 Import Existing Projects

Already have a `.env` file?

Import your existing variables into SecretStash and begin syncing immediately.

---

## 🆚 Why Not Just Use `.env` Files?

`.env` files alone:

- ❌ Hard to share securely
- ❌ Easy to leak
- ❌ Not synced across teams
- ❌ No access control

SecretStash:

- ✅ Secure sharing
- ✅ Encrypted end-to-end
- ✅ Built for teams
- ✅ CLI-first workflow

---

## 📚 Documentation

Full documentation available at:

👉 https://docs.secretstash.cloud

---

## ❤️ Ready to stop leaking secrets?

Start using SecretStash today:

👉 https://secretstash.cloud

---

## Testing

```bash
npm test
```

## Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for details.

## Credits

- [Doug Niccum](https://github.com/dniccum)
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
