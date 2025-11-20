# Agent Guidelines for Applied Epic Migration

## Instructions

- When you are finished with a task, run our linting and typechecking commands to ensure code quality. `bun run typecheck` and `bun run check`. We need to resolve these issues in the files we have edited before the task is complete.
- **Do not modify AGENTS.md or CLAUDE.md files** unless explicitly requested by the user.
- **Do not use destructive git commands** (like `git reset`, `git rebase`, `git commit --amend`) unless explicitly instructed by the user.

## Build/Lint/Test Commands

- **Package Manager**: bun (pnpm compatible)
- **Typecheck**: `bun run typecheck` or `tsc -b tsconfig.json`
- **Lint/Format**: `bun run check` or `biome check --fix .`
- **Test**: `bun test` or `vitest`
- **Single test**: `bun test --run filename.test.ts` or `vitest run filename.test.ts`

## Code Style Guidelines

- **TypeScript**: Strict mode, ES2022 target, NodeNext modules, Effect language service
- **Formatting**: Biome with space indentation, double quotes, semicolons, import organization
- **Linting**: No non-null assertions, no parameter reassignment, no inferrable types
- **Naming**: PascalCase for types/interfaces, camelCase for functions/properties, kebab-case files
- **Architecture**: Effect framework with `Effect.gen`, `Context.GenericTag`, Layer.effect for DI
- **Error Handling**: Structured `ApiError` with type/title/status/detail fields
- **Imports**: External libraries first, internal modules with `.js` extension

## Git Hooks (Lefthook)

- **Pre-commit**: Biome check/fix, TypeScript check
- **Pre-push**: Biome check/fix, TypeScript check

## Folders

- Use `scratchpad` for temporary code snippets and experiments.

## Other

- Always use Effects `FileService` service instead of `node:fs`
- Use Effects `@effect/vitest` package in favor of `vitest` for testing
- When possible, use effect. Always try to make things "Effectful"
- Do not use try/catch blocks for error handling, use Effects error handling
