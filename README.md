# Lock Breaker GitHub Action

A GitHub Action that refreshes specific packages in your `yarn.lock` file to get the latest compatible versions. This is useful for bulk upgrades when you want to refresh specific dependencies across multiple projects.

## Features

- 🔄 Refreshes specific packages in yarn.lock
- 🔍 Automatically finds and updates dependent packages
- 🔧 Reinstalls packages with yarn to get fresh versions
- 📝 Optionally commits changes with customizable messages
- ⚡ Fast and efficient for bulk dependency updates

### Basic Example

```yaml
name: Refresh Dependencies
on:
  workflow_dispatch:
    inputs:
      packages:
        description: 'Packages to refresh'
        required: true
        default: 'lodash react'

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Refresh packages
        uses: your-username/lock-breaker@v1
        with:
          packages: ${{ github.event.inputs.packages }}
```

### Advanced Example

```yaml
name: Weekly Dependency Refresh
on:
  schedule:
    - cron: '0 0 * * 1'  # Every Monday at midnight
  workflow_dispatch:

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Refresh critical packages
        uses: your-username/lock-breaker@v1
        with:
          packages: 'react react-dom typescript @types/node'
          directory: '.'
          commit: 'true'
          commit-message: 'chore: weekly dependency refresh'
          skip-hooks: 'true'
      
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          commit-message: 'chore: refresh dependencies'
          title: 'Weekly Dependency Refresh'
          body: |
            This PR refreshes the following packages in yarn.lock:
            - react
            - react-dom
            - typescript
            - @types/node
          branch: dependency-refresh
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `packages` | Space-separated list of packages to refresh | **Yes** | - |
| `directory` | Directory containing the yarn.lock file | No | `.` |
| `commit` | Whether to commit the changes | No | `true` |
| `commit-message` | Custom commit message | No | `Refresh {packages} dependencies` |
| `skip-hooks` | Skip git pre-commit hooks | No | `true` |

## Outputs

| Output | Description |
|--------|-------------|
| `updated-packages` | List of packages that were updated |
| `commit-sha` | SHA of the commit if changes were committed |

## How It Works

1. **Reads yarn.lock**: The action reads the yarn.lock file in the specified directory
2. **Removes packages**: For each specified package:
   - Finds all entries for that package in yarn.lock
   - Recursively finds and removes dependent packages
   - Removes all found entries from yarn.lock
3. **Reinstalls**: Runs `yarn install` to reinstall the packages with fresh versions
4. **Commits changes**: Optionally commits the changes to git with a descriptive message

## Requirements

- Node.js 20 or later
- Yarn package manager
- Repository must contain a yarn.lock file
- If committing, repository must be initialized with git

## Local Development

```bash
# Install dependencies
yarn install

# Build the action
yarn build

# Run tests
yarn test

# Lint and format code
yarn lint

# Fix linting issues
yarn lint:fix

# Format code
yarn format
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any problems or have suggestions, please open an issue in the GitHub repository.
