# Folder Mapping Usage

## Quick Start

The folder mapping system is now ready to use! Here's how to run it:

### 1. Run with Your CSV Data

```bash
bun scripts/run-mapping.ts path/to/your/attachments.csv
```

This will:
- Extract attachment metadata from your CSV file
- Transform it into the proper format
- Map attachment `nameOf` fields to Google Drive folder names
- Show you exact match statistics

### 2. Integration in Your Code

You can also use the orchestrator directly:

```typescript
import { runMapping } from "./src/index.js";

// Run mapping with your CSV file
runMapping("data/attachments.csv")
  .then((result) => {
    console.log("Mapping complete:", result);
  })
  .catch((error) => {
    console.error("Mapping failed:", error);
  });
```

## What It Does

1. **CSV Processing**: Extracts and validates attachment metadata from CSV
2. **Folder Discovery**: Gets all folders from your Google Drive  
3. **Exact Matching**: Matches attachment `nameOf` fields to folder names
4. **Comprehensive Reporting**: Shows match statistics and unmatched items
5. **Validation**: Ensures mapping integrity

## Expected Output

```
🚀 Starting folder mapping process for: data/attachments.csv
✅ Mapping Results:
Total Attachments: 1500
Exact Matches: 1200
Unmatched: 300
Match Rate: 80.0%

🎯 Exact Matches:
  • Test Company → Test Company (Test Company)
  • Another Corp → Another Corp (Another Corp)

❌ Unmatched Attachments:
  • Nonexistent Company (NC003)
  • Another Missing (AM004)

Validation: ✅ Passed
Errors: 0, Warnings: 0
```

## Next Steps

After running mapping:

1. **Review Unmatched Items**: Check which attachments didn't match folders
2. **Manual Mapping**: Create manual mappings for unmatched items  
3. **Fuzzy Matching**: We can add fuzzy matching later for remaining items

## Configuration

Make sure your Google Drive credentials are configured in your environment or config file before running.

## Architecture

- **`src/services/mapping/`** - Core mapping logic
- **`src/services/google-drive/`** - Google Drive API operations only
- **`scripts/run-mapping.ts`** - CLI interface for easy execution