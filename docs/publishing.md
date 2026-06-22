# Publishing Credential Metadata

`registry-cli` handles all credential metadata conversion and publishing as part of the centralized registry build pipeline. There is no need to run a separate tool or GitHub Action on individual repositories.

## How It Works

When `registry-cli build` processes a source repository, it:

1. Clones the repository (main branch)
2. Scans for Markdown files with `vct:` YAML front matter
3. Converts them to credential metadata in all supported formats (`.vctm.json`, `.mdoc.json`, `.vc.json`, `.schema.json`)
4. Detects `schema-meta.yaml` files for TS11 compliance metadata
5. Aggregates everything into the registry site in a single sweep

## Two Ways to Provide Credential Metadata

### 1. Markdown authoring (recommended)

Write credential definitions as Markdown with YAML front matter. `registry-cli` converts them automatically during the build:

```markdown
---
vct: https://example.com/credentials/my-credential
background_color: "#003366"
text_color: "#FFFFFF"
---

# My Credential

A description of the credential.

## Claims

- `given_name` (string): Given name [mandatory]
- `family_name` (string): Family name [mandatory]
- `email` (string): Email address
- `address` (object): Postal address
    - `street` (string): Street address
    - `city` (string): City
```

Claims can be nested using Markdown sub-lists — use `(object)` for structured data and `(array)` for repeating items. See the [nested claims documentation](https://developers.siros.org/docs/sirosid/registry/registry-cli#nested-claims) for details.

To generate only specific output formats, add `formats:` to the front matter (e.g. `formats: sd-jwt, w3c`). See [per-credential format override](https://developers.siros.org/docs/sirosid/registry/registry-cli#per-credential-formats).

See [Markdown Format](../docs/markdown-format.html) for the full authoring guide.

### 2. Pre-built metadata files

Place `.vctm.json`, `.mdoc.json`, `.vc.json`, `.schema.json` files directly in the repository. These are used as-is without conversion.

## TS11 Governance Metadata (schema-meta.yaml)

For credentials to appear in the **TS11 Catalogue of Attestations API** (`/api/v1/schemas.json`), they must include a `.schema-meta.yaml` file alongside the credential metadata files. This file declares governance properties required by TS11.

### Required Fields

Every credential must specify:

```yaml
---
attestation_los: iso_18045_high    # Attestation Level of Surety
binding_type: key                  # Holder binding type
```

| Field | Allowed Values | Notes |
|-------|----------------|-------|
| `attestation_los` | `iso_18045_high`, `iso_18045_moderate`, `iso_18045_enhanced-basic`, `iso_18045_basic` | Per ISO 18045. Aliases like `high`, `moderate`, `substantial`, `basic` are normalized automatically. |
| `binding_type` | `key`, `biometric`, `claim`, `none` | How holder identity is bound. Aliases: `cnf` → `key`, `holder` → `key`. |

### Optional Fields

```yaml
version: "1.0.0"                   # Schema version (semver). Default: "0.1.0"
rulebook_uri: https://...          # URL to attestation rulebook
trusted_authorities:               # Trust framework references
  - framework_type: etsi_tl
    value: "https://tl.etsi.org/..."
    is_lote: false
```

#### Trusted Authorities

Trust authority entries reference governance frameworks and trust marks:

```yaml
trusted_authorities:
  - framework_type: etsi_tl        # Framework identifier
    value: "https://..."            # Trust list URL or endpoint
    is_lote: false                  # Is this a List of Trusted Entities?
    trust_mark_id: "https://..."    # (optional) Trust mark URI
    trust_mark_issuers:             # (optional) Authorized issuers
      - "https://issuer.example.com"
```

### Auto-Generated Fields

The following fields are inferred by registry-cli at build time — do NOT set them:

- `id` — UUID v5 derived from organization + credential slug
- `supportedFormats` — Detected from co-located `.vctm.json`, `.mdoc.json`, `.vc.json` files
- `schemaURIs` — Generated from supported formats + registry base URL
- `rulebookURI` — Auto-detected from co-located `rulebook.md` if present

### File Placement

Place `schema-meta.yaml` alongside your credential files:

```
credentials/
├── my-credential.md                  # Markdown source
├── my-credential.schema-meta.yaml    # TS11 governance metadata (NEW)
├── my-credential.vctm.json           # Auto-generated or pre-built
├── my-credential.mdoc.json           # Auto-generated or pre-built
└── my-credential.vc.json             # Auto-generated or pre-built
```

### Minimal Example

```yaml
# my-credential.schema-meta.yaml
attestation_los: iso_18045_high
binding_type: key
```

### Comprehensive Example

```yaml
# vctm_diploma.schema-meta.yaml
attestation_los: iso_18045_moderate
binding_type: key
version: "2.0.1"
rulebook_uri: https://registry.siros.org/sirosfoundation/vctm_diploma/rulebook.html
trusted_authorities:
  - framework_type: etsi_tl
    value: "https://tl.etsi.org/export/trustlist.xml"
    is_lote: false
  - framework_type: eidas
    value: "https://eidas.ec.europa.eu"
    is_lote: false
    trust_mark_id: "https://eidas.ec.europa.eu/markers/moderate"
    trust_mark_issuers:
      - "https://eu.example.com/marker-issuer"
```

### Visibility Rules

| Scenario | Site Appearance | TS11 API (`/api/v1/schemas.json`) |
|----------|-----------------|-----------------------------------|
| With `schema-meta.yaml` | ✅ Visible (detail page + listing) | ✅ Included |
| Without `schema-meta.yaml` | ✅ Visible (detail page + listing) | ❌ Excluded |

This allows credentials to appear on the site while you work toward TS11 compliance. When ready, add a `schema-meta.yaml` file and commit it to make the credential TS11-compliant.

## Normalization

`registry-cli` applies normalization rules during conversion to ensure credential metadata conforms to the latest specification:

| Rule | Description |
|------|-------------|
| `ensure-display-array` | Ensure `display` is an array |
| `rename-lang-to-locale` | Fix legacy `lang` → `locale` |
| `set-display-locale-default` | Default locale to `en-US` |
| `set-display-name-from-root` | Copy `name` to display entries |
| `remove-empty-svg-template-properties` | Clean up empty `properties` |
| `remove-empty-description` | Remove empty descriptions |
