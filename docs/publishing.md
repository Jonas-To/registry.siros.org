# Publishing VCTM Files

mtcvctm supports two workflows for publishing credential metadata:

1. **Markdown-based** - Author credentials in markdown, auto-convert to VCTM
2. **Raw JSON** - Publish existing VCTM JSON files directly

## Raw VCTM Publication

Use `publish-vctm` when you have existing VCTM JSON files that you want to publish without going through the markdown workflow.

### File Patterns

The command looks for files matching:
- `*.vctm.json`
- `vctm_*.json`
- `vctm-*.json`

### Basic Usage

```bash
# Publish raw VCTM files
mtcvctm publish-vctm --input ./vctm-files --output ./vctm

# With image inlining
mtcvctm publish-vctm --input ./vctm-files --output ./vctm --inline-images

# In GitHub Action mode
mtcvctm publish-vctm --github-action --vctm-branch vctm
```

### Command Options

| Option | Description |
|--------|-------------|
| `--input, -i` | Input directory containing VCTM JSON files |
| `--output, -o` | Output directory for VCTM files |
| `--github-action` | Run in GitHub Action mode |
| `--vctm-branch` | Branch name for VCTM files (default: `vctm`) |
| `--fetch-images` | Fetch network images and store locally |
| `--inline-images` | Inline images as data:image URLs |
| `--base-url` | Base URL for rewriting image paths |
| `--no-normalize` | Skip normalization rules |
| `--disable-rules` | Comma-separated list of rules to disable |
| `--verbose-rules` | Show which normalization rules were applied |

### Example Workflow

```yaml
name: Publish VCTM

on:
  push:
    branches: [main]
    paths:
      - 'vctm/**/*.json'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install mtcvctm
        run: go install github.com/sirosfoundation/mtcvctm/cmd/mtcvctm@latest
      
      - name: Publish VCTM files
        run: |
          mtcvctm publish-vctm \
            --input ./vctm \
            --output ./dist \
            --github-action \
            --vctm-branch vctm
```

## Normalization

Both `publish-vctm` and `batch` commands support normalization rules that fix legacy field names and add missing required fields.

### Why Normalize?

VCTM specifications evolve. Normalization ensures your VCTM files:

- Use current field names (`locale` instead of legacy `lang`)
- Have required fields (`display.locale`, `display.name`)
- Don't contain empty optional fields (`properties: {}`)

### Enabling Normalization

```bash
# With batch command
mtcvctm batch --input ./credentials --output ./vctm --normalize

# With publish-vctm (applies by default, disable with --no-normalize)
mtcvctm publish-vctm --input ./vctm-files --output ./vctm

# Normalize a single file
mtcvctm normalize credential.vctm.json
```

### Available Rules

| Rule | Description |
|------|-------------|
| `ensure-display-array` | Ensure `display` is an array |
| `rename-lang-to-locale` | Fix legacy `lang` → `locale` |
| `set-display-locale-default` | Default locale to `en-US` |
| `set-display-name-from-root` | Copy `name` to display entries |
| `remove-empty-svg-template-properties` | Clean up empty `properties` |
| `remove-empty-description` | Remove empty descriptions |

### Preview Changes

Use `--dry-run` to see what would change:

```bash
mtcvctm normalize --dry-run -v credential.vctm.json
```

Output:
```
Applied rules: ensure-display-array, rename-lang-to-locale, set-display-name-from-root

Normalized output (dry run):
{
  "vct": "https://example.com/test",
  "name": "Test Credential",
  "display": [
    {
      "locale": "en-US",
      "name": "Test Credential"
    }
  ]
}
```
