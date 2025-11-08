# Google Drive Reorganization Implementation Plan

## Objective
Connect the completed attachment metadata pipeline to Google Drive operations to reorganize EPIC files into proper client folder structure.

## Current Status

### ✅ Completed Components
- **Google Drive Auth Service** - Service account authentication with caching
- **Google Drive File Service** - Complete file operations (list, upload, move, create folders)
- **Folder Reader Service** - Recursive folder reading with subfolder support
- **Attachment Metadata Pipeline** - Complete CSV processing with validation, transformation, deduplication
- **Year Resolution Service** - 18-priority year extraction with comprehensive fallbacks
- **Attachment Orchestrator** - Full metadata processing workflow

### ❌ Missing Components
- **Google Drive Reorganization Service** - Connect metadata to Drive operations
- **Final Reorganization Script** - One-time execution script

## Implementation Plan

### Phase 1: Google Drive Reorganization Service

#### 1.1 Service Structure
```typescript
// Types needed
interface OrganizedAttachment extends Attachment {
  readonly key: string;
  readonly determinedYear: number;
}

interface ReorganizationResult {
  readonly success: boolean;
  readonly totalFiles: number;
  readonly processedFiles: number;
  readonly failedFiles: number;
  readonly errors: readonly string[];
}

interface TargetFolderStructure {
  readonly clientName: string;
  readonly year: number;
  readonly folderPath: string[];
}
```

#### 1.2 Core Functions
- **normalizeYear()** - Map 2018-2023 to 2023
- **determineTargetStructure()** - Create Client/Year folder path
- **createFolderStructure()** - Recursively create folder hierarchy
- **processAttachment()** - Process single attachment
- **processAttachments()** - Batch process with concurrency
- **processOrganizedAttachments()** - Main entry point

#### 1.3 Key Features
- Dry-run mode for testing
- Concurrent processing (10 attachments at a time)
- Comprehensive error handling and logging
- Service account verification

### Phase 2: Final Reorganization Script

#### 2.1 Script Structure
```typescript
// Main execution flow
const mainReorganization = () =>
  Effect.gen(function* () {
    // 1. Process attachment metadata
    const organized = yield* attachmentOrchestrator.run();
    
    // 2. Verify service account access
    const serviceInfo = yield* reorganizationService.getServiceAccountInfo();
    
    // 3. Execute reorganization (dry run first)
    const dryRunResult = yield* reorganizationService.processOrganizedAttachments(
      organized,
      { dryRun: true }
    );
    
    // 4. Execute actual reorganization
    const finalResult = yield* reorganizationService.processOrganizedAttachments(
      organized,
      { dryRun: false }
    );
    
    return finalResult;
  });
```

#### 2.2 Execution Steps
1. **Metadata Processing** - Run attachment orchestrator
2. **Service Account Verification** - Confirm access
3. **Dry Run** - Test without moving files
4. **Confirmation** - User confirms to proceed
5. **Actual Reorganization** - Execute file moves
6. **Final Report** - Summary of operations

### Phase 3: Integration Points

#### 3.1 Data Flow
```
CSV Data → Attachment Orchestrator → Organized Attachments → 
Reorganization Service → Google Drive Operations
```

#### 3.2 Error Handling Strategy
- Graceful degradation for individual file failures
- Comprehensive logging of all operations
- Rollback capability (if needed)
- Progress tracking and resumption

#### 3.3 Performance Considerations
- Batch processing with controlled concurrency
- Folder creation optimization (check before create)
- Memory management for large datasets
- Progress reporting

## Target Folder Structure
```
Client Name/
├── Year/
│   ├── (Optional: Product folders if classification added later)
│   │   ├── Billing/
│   │   ├── Audit & Collections/
│   │   ├── Claims/
│   │   ├── Policy & Endorsements/
│   │   └── Renewal and/or Cross Sell/
```

## Special Cases Handling
- **Multiple folders with same year**: Merge into single year folder
- **Missing year information**: Use current year or skip with logging
- **Permission errors**: Log and continue with other files
- **Duplicate folder names**: Use existing folders
- **File not found**: Log and continue

## Testing Strategy
1. **Unit Tests** - Individual service functions
2. **Integration Tests** - Full pipeline with test data
3. **Dry Run Testing** - Verify folder structure creation
4. **Small Batch Testing** - Test with subset of data
5. **Full Execution** - Complete reorganization

## Success Criteria
- All attachments processed and categorized by year
- Proper folder structure created in Google Drive
- Files moved to correct Client/Year locations
- Comprehensive logging of all operations
- Error handling for edge cases
- Performance acceptable for dataset size

## Next Steps
1. Implement Google Drive Reorganization Service
2. Create final reorganization script
3. Test with dry run mode
4. Execute actual reorganization
5. Generate final report