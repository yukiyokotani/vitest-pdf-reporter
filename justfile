default:
    @just --list

# Install dependencies and Playwright Chromium
install:
    pnpm install
    pnpm exec playwright install chromium

# Build the package
build:
    pnpm -w build

# Watch mode build
dev:
    pnpm -w dev

# Run unit tests
test:
    pnpm -w test

# Run unit tests in watch mode
test-watch:
    pnpm -w test:watch

# Type-check the project
typecheck:
    pnpm -w typecheck

# Build the package then run the example to produce a sample PDF
example: build
    pnpm --filter vitest-pdf-reporter-example test

# Build the docs site
docs-build:
    pnpm --filter vitest-pdf-reporter-docs build

# Start the docs dev server
docs-dev:
    pnpm --filter vitest-pdf-reporter-docs dev

# Clean build artifacts
clean:
    rm -rf dist docs/dist examples/basic/test-reports

# Publish to npm (runs build via prepublishOnly)
publish:
    pnpm publish --access public
