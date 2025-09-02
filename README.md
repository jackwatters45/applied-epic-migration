# Applied Epic Attachments API Client

A TypeScript client for reading and downloading attachments from the Applied Epic API using Effect for functional programming.

## Setup

1. **Install dependencies:**
   ```sh
   pnpm install
   ```

2. **Configure credentials:**
   Set your Applied Epic API credentials as environment variables:
   ```sh
   export APPLIED_EPIC_CLIENT_ID="your-client-id"
   export APPLIED_EPIC_CLIENT_SECRET="your-client-secret"
   ```

3. **Choose environment:**
   - Mock environment (default): `https://api.mock.myappliedproducts.com`
   - Production environment: `https://api.myappliedproducts.com`

## Usage

### Basic Example

Run the main program to list and download attachments:

```sh
pnpm tsx ./src/Program.ts
```

### Download Attachments for a Specific Account

```typescript
import { downloadAccountAttachments } from "./src/attachment-downloader.js"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { AppLayer } from "./src/attachment-downloader.js" // You'll need to export this

Effect.runPromise(
  Effect.provide(
    downloadAccountAttachments("your-account-id", "./downloads"),
    AppLayer
  )
).catch(console.error)
```

### Download a Specific Attachment

```typescript
import { downloadAttachmentById } from "./src/attachment-downloader.js"

Effect.runPromise(
  Effect.provide(
    downloadAttachmentById("attachment-id", "./downloads"),
    AppLayer
  )
).catch(console.error)
```

## Services

### AuthService
Handles authentication with the Applied Epic API using OAuth2 client credentials flow.

### AttachmentsService
- `listAttachments(params?)`: List attachments with optional filtering
- `getAttachment(id)`: Get details for a specific attachment

### DownloadService
- `downloadAttachment(attachment, outputPath)`: Download an attachment file
- `downloadAttachmentById(id, outputPath)`: Download attachment by ID (requires integration)

## Configuration

The `ConfigService` manages API endpoints and credentials:

```typescript
import { ConfigService } from "./src/config.js"

const config = ConfigService.getInstance()

// Set credentials
config.setCredentials({
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
  baseUrl: "https://api.mock.myappliedproducts.com"
})

// Switch to production
config.setEnvironment(true)
```

## API Documentation

See the [Applied Epic Attachments API documentation](./docs/applied-epic/attachments-api.md) for detailed API specifications.

## Running Code

This template leverages [tsx](https://tsx.is) to allow execution of TypeScript files via NodeJS as if they were written in plain JavaScript.

To execute a file with `tsx`:

```sh
pnpm tsx ./path/to/the/file.ts
```

## Operations

**Building**

To build the package:

```sh
pnpm build
```

**Testing**

To test the package:

```sh
pnpm test
```
