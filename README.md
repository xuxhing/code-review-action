# Code review action

```
inputs:
  GITHUB_TOKEN:
    description: "GitHub token to interact with the repository."
    required: true
  SMART_CODER_API_URL:
    description: "SmartCoder api url."
    required: true
  SMART_CODER_API_KEY:
    description: "API key for SmartCoder."
    required: true
  exclude:
    description: "Glob patterns to exclude files from the diff analysis"
    required: false
    default: ""
```


### 使用
```
name: Test

on:
  pull_request:
    types:
      - opened
      - reopened
      - synchronize

permissions: write-all

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - name: SmartCoder Code Review
        uses: xuxhing/code-review-action@v1.0.0-beta
```