# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript migration tool for handling attachments between Applied Epic API and Google Drive. It uses Effect for functional programming patterns and provides services for authentication, downloading attachments, and managing Google Drive operations.

## Development Commands

### Package Management
- **Install dependencies**: `bun install` or `pnpm install`
- **Run TypeScript files**: `pnpm tsx ./path/to/file.ts` or `bun run ./path/to/file.ts`

### Code Quality
- **Type checking**: `bun run typecheck` or `pnpm run typecheck`
- **Linting and formatting**: `bun run check` or `pnpm run check` (uses Biome)
- **Fix issues**: `biome check --fix .`

### Build
- **Build project**: `pnpm build`

### Running the Application
- **Main program**: `pnpm tsx ./src/index.ts`
- **Applied Epic example**: `pnpm tsx ./src/applied-epic/attachment-downloader.ts`
- **Google Drive example**: `pnpm tsx ./src/google-drive/example.ts`

## Architecture

### Core Services Structure

The application follows a service-oriented architecture using Effect layers:

1. **Applied Epic Integration** (`src/applied-epic/`)
   - `auth.ts`: OAuth2 authentication service
   - `attachments.ts`: Service for listing and fetching attachments
   - `download.ts`: Service for downloading files
   - `attachment-downloader.ts`: High-level orchestration functions

2. **Google Drive Integration** (`src/google-drive/`)
   - `auth.ts`: Google OAuth2 authentication
   - `file.ts`: File operations service
   - `folder-strategy.ts`: Folder organization strategies
   - `example.ts`: Usage examples

3. **Shared Libraries** (`src/lib/`)
   - `config.ts`: Configuration management (singleton pattern)
   - `errors.ts`: Custom error types
   - `types.ts`: Shared TypeScript types

### Service Layer Pattern

All services use Effect layers for dependency injection:
- Services are defined as Effect Context.Tag
- Live implementations are provided as Layer
- Dependencies are composed using Layer.provide and Layer.merge

Example:
```typescript
const AppLayer = Layer.merge(
  AuthServiceLive,
  Layer.provide(AttachmentsServiceLive, AuthServiceLive)
)
```

### Configuration

Environment variables (loaded automatically via dotenv):
- `APPLIED_EPIC_CLIENT_ID`: Applied Epic API client ID
- `APPLIED_EPIC_CLIENT_SECRET`: Applied Epic API client secret
- `APPLIED_EPIC_ENV`: Environment (production/mock, defaults to mock)

### Error Handling

The codebase uses Effect's error handling with typed errors. All service methods return Effect types with explicit error channels.

## Code Style

- **Formatter**: Biome with 2-space indentation
- **Quotes**: Double quotes for strings
- **Semicolons**: Always use semicolons
- **Imports**: Use import type for type-only imports
- **File extensions**: Always include `.js` extension in imports (even for TypeScript files)

## Pre-commit Hooks

Lefthook runs automatically on commit:
- Biome formatting and linting
- TypeScript type checking

## Key Dependencies

- **effect**: Functional programming library (v3.17.7)
- **googleapis**: Google APIs client library
- **@google-cloud/local-auth**: Google authentication
- **tsx**: TypeScript execution
- **biome**: Code formatting and linting