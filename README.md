# registry.siros.org

A static site builder that aggregates and publishes Verifiable Credential Type Metadata (VCTM) files from multiple repositories.

## Overview

This project builds a GitHub Pages site at `https://registry.siros.org` that:

- Collects VCTMs from repositories using the [mtcvctm](https://github.com/sirosfoundation/mtcvctm) GitHub Action
- Organizes VCTMs by organization
- Provides consistent, stable URLs for direct VCTM reference
- Displays metadata with SIROS branding

## How It Works

1. Repositories run the `mtcvctm` GitHub Action to generate VCTMs
2. The action publishes VCTMs to a `vctm` branch with `.well-known/vctm-registry.json`
3. This site builder fetches VCTMs from registered repositories
4. A static site is generated and deployed to GitHub Pages

## URL Structure

VCTMs are accessible at:
```
https://registry.siros.org/<org>/<vctm-name>.json
```

For example:
```
https://registry.siros.org/sirosfoundation/identity-credential.json
```

## Repository Requirements

To be included in the registry, a repository must:

1. Have a `vctm` branch
2. Contain `.well-known/vctm-registry.json` in that branch
3. Have one or more `.json` VCTM files in the branch

## Configuration

Edit `config/repositories.txt` to add repositories (one per line):

```
sirosfoundation/example-credentials
myorg/my-credentials
```

## Development

```bash
# Install dependencies
npm install

# Build locally
npm run build

# Preview site
npm run serve
```

## License

Apache-2.0
