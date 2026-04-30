[![Latest Version on Packagist](https://img.shields.io/packagist/v/dniccum/secret-stash-cli.svg?style=flat-square)](https://packagist.org/packages/dniccum/secret-stash-cli)
[![GitHub Tests Action Status](https://img.shields.io/github/actions/workflow/status/dniccum/secret-stash-cli/run-tests.yml?branch=main&label=tests&style=flat-square)](https://github.com/dniccum/se[...]
[![GitHub Code Style Action Status](https://img.shields.io/github/actions/workflow/status/dniccum/secret-stash-cli/fix-php-code-style-issues.yml?branch=main&label=code%20style&style=flat-square)](h[...]
[![Total Downloads](https://img.shields.io/packagist/dt/dniccum/secret-stash-cli.svg?style=flat-square)](https://packagist.org/packages/dniccum/secret-stash-cli)

![SecretStash](og-image.png)

# SecretStash Node Package

A Node.js package that provides commands for interacting with the [SecretStash](https://secretstash.cloud) REST API. This package is modeled after the SecretStash CLI project and allows you to manage your environment variables programmatically.

## Requirements

- Node.js 14 or higher
- A SecretStash API Key

## Installation

Install the package via npm:

```bash
npm install @dniccum/secret-stash-node --save
```

> **Important**: This package creates a `~/.secret-stash` directory on your machine (or the path specified by the `SECRET_STASH_KEY_DIR` environment variable). Ensure this folder is secure as it contains sensitive keys.

## Configuration

Add the following environment variables to your application's `.env` file:

```dotenv
SECRET_STASH_API_TOKEN=your_api_token_here
SECRET_STASH_APPLICATION_ID=your_application_id_here
```

- **API Key**: Create a token in SecretStash in the "Tokens" tab of your profile settings.
- **Application ID**: Create or access an application in SecretStash and retrieve its ID from the dashboard.

## Quick Example

Pull your environment's variables from SecretStash into your local `.env` file:

```bash
node secret-stash pull
```

Push your local `.env` variables to SecretStash:

```bash
node secret-stash push
```

For the full list of available commands and options, visit the [SecretStash CLI documentation](https://docs.secretstash.cloud/command-line-interface/commands).

## Testing

Run the tests with:

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