# Code review action


# Setup

## 1. Add a workflow like this in your repo.

Example `.github/workflows/code-review.yml`

```
name: Code review

on:
  pull_request:
    types:
      - opened
      - synchronize

permissions: write-all

jobs:
  code-review:
    runs-on: ubuntu-latest
    
    steps:
      - name: Code Review
        uses: xuxhing/code-review-action@latest
        with:
          GITHUB_TOKEN: ${{ github.token }}
          SMART_CODER_API_URL: ${{ vars.SMART_CODER_API_URL }}
          SMART_CODER_API_KEY: ${{ secrets.SMART_CODER_API_KEY }}
          exclude: "yarn.lock,dist/**"
```


# Inputs

### `GITHUB_TOKEN`
    description: "GitHub token to interact with the repository."
### `SMART_CODER_API_URL`
    description: "SmartCoder api url."
    required: true
### `SMART_CODER_API_KEY`
    description: "API key for SmartCoder."
    required: true
### `exclude`
    description: "Glob patterns to exclude files from the diff analysis"
    required: false