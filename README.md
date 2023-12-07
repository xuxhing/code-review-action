# Code review action

## 配置
  
  前往Repository->Settings->Secrets and variables

  1. 添加Repository secrets 
    ```
      GIT_HUB_API_KEY
      SMART_CODER_API_KEY
    ```
  2. 添加Repository variables
    ```
    SMART_CODER_API_URL
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
      - name: Checkout repository
        id: checkout
        uses: actions/checkout@v4
      - name: SmartCoder Code Review
        uses: xuxhing/code-review-action@v1.0.0-beta
```