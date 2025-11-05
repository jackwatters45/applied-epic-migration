# Applied Epic Migration Project

A TypeScript project for reorganizing EPIC files using Google Drive API with modern Effect framework patterns.

## Project Purpose

This project reorganizes EPIC files from Applied Epic into proper client folder structures using Google Drive API. It demonstrates modern functional programming architecture using Effect services, tagged errors, and proper dependency injection.

## Current Objective

Reorganize EPIC files into the proper folder structure:
```
Client Name/
├── Year/
│   ├── Product (Yr WC or Yr PKG)/
│   │   ├── Billing/
│   │   ├── Audit & Collections/
│   │   ├── Claims/
│   │   ├── Policy & Endorsements/
│   │   └── Renewal and/or Cross Sell/
```

## Core Architecture

### Main Components

**Google Drive Integration** (`src/services/google-drive/`)

- **Auth Service**: Google Cloud authentication using Effect.Service with tagged errors
- **File Service**: Upload and manage files in Google Drive
- **Folder Strategy**: Organize files in Drive with custom folder structures

**Reorganization Services** (Planned)

- **Folder Scanner Service**: Scan and analyze source files
- **Year Resolution Service**: Map years (2018-2023 → 2023)
- **Client/Product Classifier Service**: Categorize by keywords (PKG→crime, Work Comp→claims/mod)
- **File Operations Service**: Create structure and move files

### Key Files

- **`src/index.ts`**: Main entry point demonstrating Google Drive service usage
- **`src/lib/config.ts`**: Configuration management using Effect.Service pattern
- **`src/lib/types.ts`**: TypeScript interfaces and type definitions
- **`src/lib/errors.ts`**: Structured error handling with `ApiError` type
- **`REORG_PLAN.md`**: Detailed reorganization logic plan

## Modern Effect Framework Implementation

### Service Architecture

All services use the modern `Effect.Service<T>()` pattern:

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

## Reorganization Logic

### Business Rules

- **Year Resolution**: Files from 2018-2023 map to 2023
- **Product Classification**: 
  - PKG → crime keywords
  - Work Comp → claims, mod keywords
- **Default Fallback**: When uncertain, place in year folder only
- **Duplicate Years**: Merge or drop into one correct year folder

### Workspace Strategy

1. **Test First**: Develop and test on BCX workspace
2. **Service Account**: Request service account-to-service account access
3. **Migration**: Apply to TrollyCare workspace after validation

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

### Commands

- **Install**: `bun install`
- **Typecheck**: `bun run typecheck`
- **Lint/Format**: `bun run check`
- **Run**: `bun src/index.ts`

## Code Style Guidelines

- **TypeScript**: Strict mode, ES2022 target, NodeNext modules
- **Effect**: Modern `Effect.Service` syntax with `Effect.gen` and proper dependency injection
- **Error Handling**: Structured tagged errors with `Schema.TaggedError`
- **Formatting**: Biome with space indentation, double quotes, semicolons
- **Naming**: PascalCase for types/interfaces, camelCase for functions/properties, kebab-case files

## Current State

✅ **Modern Effect Services**: All services use `Effect.Service<T>()` pattern with proper dependencies
✅ **Tagged Errors**: Proper error handling with `Schema.TaggedError` 
✅ **Google Drive Integration**: Complete authentication service with caching and error handling
✅ **Clean Architecture**: Separation of concerns with dependency injection
✅ **Type Safety**: Full TypeScript strict mode compliance
✅ **Code Quality**: Passes all lint and typecheck requirements
🚧 **Reorganization Services**: Planned implementation based on `REORG_PLAN.md`

## Next Steps

1. Implement Folder Scanner Service
2. Create Year Resolution Service  
3. Build Client/Product Classifier Service
4. Develop File Operations Service
5. Create Orchestrator Service
6. Add CLI interface with dry-run mode