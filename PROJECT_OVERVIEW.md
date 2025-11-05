# Applied Epic Migration Project Overview

## Project Purpose

This is a TypeScript project demonstrating modern Effect framework patterns with Google Drive integration. Originally designed as a migration tool for Applied Epic API attachments, the project now serves as a clean example of functional programming architecture using Effect services, tagged errors, and proper dependency injection.

## Core Architecture

### Main Components

**Google Drive Integration** (`src/services/google-drive/`)

- **Auth Service**: Modern Google Cloud authentication using Effect.Service with tagged errors
- **File Service**: Upload and manage files in Google Drive
- **Folder Strategy**: Organize files in Drive with custom folder structures
- **Example**: Complete usage demonstration with authentication testing

**Additional Services**

- **Momentum AMP**: Authentication for Momentum platform (legacy implementation)

### Key Files

- **`src/index.ts`**: Main entry point demonstrating Google Drive service usage
- **`src/lib/config.ts`**: Configuration management using Effect.Service pattern
- **`src/lib/types.ts`**: TypeScript interfaces and type definitions
- **`src/lib/errors.ts`**: Structured error handling with `ApiError` type

## Modern Effect Framework Implementation

### Service Architecture

All services now use the modern `Effect.Service<T>()` pattern:

```typescript
export class GoogleDriveAuthService extends Effect.Service<GoogleDriveAuthService>()(
  "GoogleDriveAuthService",
  {
    effect: Effect.gen(function* () {
      const config = yield* ConfigService;
      return {
        getAuthenticatedClient: () => Effect.gen(function* () { /* ... */ }),
        getServiceAccountEmail: () => Effect.gen(function* () { /* ... */ })
      } as const;
    }),
    dependencies: [ConfigService.Default],
  }
) {}
```

### Tagged Error Handling

Proper data-tagged errors using `Schema.TaggedError`:

```typescript
export class GoogleDriveAuthError extends Schema.TaggedError<GoogleDriveAuthError>()(
  "GoogleDriveAuthError",
  {
    message: Schema.String,
    status: Schema.optional(Schema.Number),
  }
) {}
```

## Current Workflow

1. **Configuration**: Load Google Drive settings from environment variables
2. **Authentication**: Test Google Drive service account authentication
3. **Service Info**: Retrieve and display service account email
4. **Validation**: Verify credentials and permissions

## Configuration

Environment variables needed:

- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`: Path to Google service account JSON key file (default: "service-account-key.json")
- `GOOGLE_DRIVE_SCOPES`: Comma-separated list of Google Drive scopes (default: read-only + file access)

## Development Setup

Uses Bun as package manager with:

- **Effect Framework**: Functional programming with modern service patterns
- **Biome**: Linting and formatting with space indentation, double quotes, semicolons
- **TypeScript**: Strict mode, ES2022 target, NodeNext modules
- **Lefthook**: Git hooks (pre-commit/pre-push) for code quality

### Build/Lint/Test Commands

- **Package Manager**: `bun` (pnpm compatible)
- **Typecheck**: `bun run typecheck` or `tsc -b tsconfig.json`
- **Lint/Format**: `bun run check` or `biome check --fix .`

## Code Style Guidelines

- **TypeScript**: Strict mode, ES2022 target, NodeNext modules
- **Effect**: Modern `Effect.Service` syntax with `Effect.gen` and proper dependency injection
- **Error Handling**: Structured tagged errors with `Schema.TaggedError`
- **Formatting**: Biome with space indentation, double quotes, semicolons
- **Naming**: PascalCase for types/interfaces, camelCase for functions/properties, kebab-case files

## Current State

The project demonstrates:

✅ **Modern Effect Services**: All services use `Effect.Service<T>()` pattern with proper dependencies
✅ **Tagged Errors**: Proper error handling with `Schema.TaggedError` 
✅ **Google Drive Integration**: Complete authentication service with caching and error handling
✅ **Clean Architecture**: Separation of concerns with dependency injection
✅ **Type Safety**: Full TypeScript strict mode compliance
✅ **Code Quality**: Passes all lint and typecheck requirements

The Applied Epic migration logic has been removed to focus on clean Effect framework patterns and Google Drive integration as a reference implementation.