# Attachment Organization Plan

## Overview

Organize attachment files from a flat UUID-named structure in Google Drive into a hierarchical `Agency/Year/` structure, then merge into the shared drive.

## Current State

### Source: Attachments Drive
- **Location**: Google Drive folder `1-T0Lemwm8hxzmgfYPrZTaaYQnmRH1Qh4`
- **Structure**: Flat folder with UUID-named files
- **Example**: `000565a8-57ad-4dd5-9ba3-efe0965c91bc.pdf`

### Metadata CSV
- **Path**: `data/BORDE05_AttachmentMetaData_Report.xlsx - Results.csv`
- **Key Fields**:
  | Field | Description | Example |
  |-------|-------------|---------|
  | `FileID` | UUID of file | `000565a8-57ad-4dd5-9ba3-efe0965c91bc` |
  | `FileExtension` | File type | `.pdf` |
  | `NewPath` | Lookup code path | `\MORGARE-01\{uuid}.pdf` |
  | `DescriptionOf` | Original filename | `21 Finance Contract Signed.pdf` |
  | `NameOf` | Agency name | `Morgantown Area Private Duty, LLC` |
  | `AttachedDate` | Date for year resolution | `3/13/23 0:00` |

### Target: Shared Drive
- **Location**: `SharedDriveId.PROD` (`0ADXTdKmRqwv7Uk9PVA`)
- **Structure**: `Agency Folder/Year/files`
- **Agency Mappings**: Stored in `data/agency-mappings.json`

---

## Goal State

```
Attachments Drive (intermediate)          Shared Drive (final)
├── Agency A/                      →      ├── Agency A/
│   ├── 2021/                             │   ├── 2021/
│   │   ├── Contract.pdf                  │   │   ├── Contract.pdf (merged)
│   │   └── Invoice.pdf                   │   │   └── Invoice.pdf (merged)
│   └── 2022/                             │   └── 2022/
│       └── Renewal.pdf                   │       └── Renewal.pdf (merged)
└── Agency B/                      →      └── Agency B/
    └── 2023/                                 └── 2023/
        └── Application.pdf                      └── Application.pdf (merged)
```

---

## Implementation Phases

### Phase 1: Rename Files in Attachments Drive

**Objective**: Rename UUID-named files to their original human-readable names.

**Input**: 
- Metadata CSV with `FileID` → `DescriptionOf` mapping
- Files in attachments drive with UUID names

**Process**:
1. Load metadata to build `FileID → DescriptionOf` lookup
2. List all files in attachments drive
3. For each file:
   - Extract UUID from filename
   - Look up original name from metadata
   - Rename file: `{uuid}.pdf` → `{description}.pdf`
   - Handle duplicates by appending counter: `Contract (2).pdf`

**Output**: 
- Files renamed to original names
- Log of rename operations for rollback

**Service**: `AttachmentRenamerService`

---

### Phase 2: Build Hierarchy in Attachments Drive

**Objective**: Create `Agency/Year/` folder structure.

**Input**:
- Metadata CSV with agency and year information
- Agency mappings (to know which agencies to process)

**Process**:
1. Load metadata organized by agency
2. For each agency with confirmed mapping:
   - Create agency folder in attachments drive
   - For each year in that agency's attachments:
     - Create year subfolder

**Output**:
- Folder hierarchy: `Attachments Drive/Agency Name/Year/`
- Map of `agencyName → { folderId, years: { year → folderId } }`

**Service**: `AttachmentHierarchyService`

---

### Phase 3: Move Files into Hierarchy

**Objective**: Move renamed files from flat structure into `Agency/Year/` folders.

**Input**:
- Renamed files in attachments drive root
- Folder hierarchy from Phase 2
- Metadata with file → agency → year mapping

**Process**:
1. For each attachment in metadata:
   - Find file in attachments drive by name
   - Determine target folder: `Agency/Year/`
   - Move file to target folder
   - Log operation for rollback

**Output**:
- Files organized in `Agency/Year/` structure
- Rollback log

**Service**: `AttachmentMoverService` (extend existing)

---

### Phase 4: Merge into Shared Drive

**Objective**: Move organized agency folders into the shared drive, merging with existing content.

**Input**:
- Organized `Agency/Year/` folders in attachments drive
- Agency mappings to shared drive folders
- Existing shared drive hierarchy

**Process**:
1. For each agency folder in attachments drive:
   - Look up target folder in shared drive via mapping
   - For each year folder:
     - If year folder exists in shared drive: merge files
     - If year folder doesn't exist: move entire folder
   - Use existing merge logic for duplicate handling

**Output**:
- Files merged into shared drive
- Empty attachments drive (or archived)
- Merge report

**Service**: `FolderMergerService` (existing)

---

## New Services Required

### 1. `AttachmentRenamerService`
```typescript
interface AttachmentRenamerService {
  // Rename a single file from UUID to original name
  renameFile(fileId: string, newName: string): Effect<RenameResult>
  
  // Bulk rename all attachments using metadata
  renameAll(options: RenameOptions): Effect<RenameReport>
}
```

### 2. `AttachmentHierarchyService`
```typescript
interface AttachmentHierarchyService {
  // Build agency/year folder structure
  buildHierarchy(options: HierarchyOptions): Effect<HierarchyResult>
  
  // Get or create agency folder
  getOrCreateAgencyFolder(agencyName: string): Effect<FolderInfo>
  
  // Get or create year folder within agency
  getOrCreateYearFolder(agencyFolderId: string, year: number): Effect<FolderInfo>
}
```

### 3. `AttachmentOrganizerService` (Orchestrator)
```typescript
interface AttachmentOrganizerService {
  // Run full organization pipeline
  organize(options: OrganizeOptions): Effect<OrganizeReport>
}
```

---

## CLI Commands

### `organize-attachments`
```bash
# Full pipeline
bun run cli organize-attachments

# Dry run (preview only)
bun run cli organize-attachments --dry-run

# Limit to N agencies (testing)
bun run cli organize-attachments --limit 5

# Run specific phase only
bun run cli organize-attachments --phase rename
bun run cli organize-attachments --phase hierarchy
bun run cli organize-attachments --phase move
bun run cli organize-attachments --phase merge
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              METADATA CSV                                    │
│  FileID | DescriptionOf | NameOf | AttachedDate | ...                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ATTACHMENTS DRIVE (Before)                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 000565a8-57ad-4dd5-9ba3-efe0965c91bc.pdf                             │   │
│  │ 000b907b-4fd7-42d5-8b20-454e797856cb.pdf                             │   │
│  │ 001ed6fb-5b60-4b49-ae68-107e9c9c6632.pdf                             │   │
│  │ ...                                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                          Phase 1: Rename Files
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ATTACHMENTS DRIVE (Renamed)                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ 21 Finance Contract Signed.pdf                                        │   │
│  │ Loss Runs EIG 19 20 VD 71921.pdf                                      │   │
│  │ Acord 2021 - SIGNED.pdf                                               │   │
│  │ ...                                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    Phase 2: Build Hierarchy + Phase 3: Move
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ATTACHMENTS DRIVE (Organized)                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Morgantown Area Private Duty, LLC/                                    │   │
│  │   └── 2021/                                                           │   │
│  │       └── 21 Finance Contract Signed.pdf                              │   │
│  │ NAB Homecare Inc. Comfort Keepers/                                    │   │
│  │   └── 2021/                                                           │   │
│  │       └── Loss Runs EIG 19 20 VD 71921.pdf                            │   │
│  │ ...                                                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                          Phase 4: Merge to Shared Drive
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SHARED DRIVE                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Morgantown Area Private Duty, LLC/         (existing agency folder)   │   │
│  │   ├── 2021/                                (existing or created)      │   │
│  │   │   ├── existing-file.pdf                (pre-existing)             │   │
│  │   │   └── 21 Finance Contract Signed.pdf   (merged from attachments)  │   │
│  │   └── 2022/                                                           │   │
│  │       └── ...                                                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| Duplicate filenames in same folder | Append counter: `file.pdf` → `file (2).pdf` |
| File not found in attachments drive | Log error, continue with next file |
| Agency not in mappings | Skip (use `delete`/`create` status from review) |
| Agency marked for `delete` | Skip entirely |
| Agency marked for `create` | Create new folder in attachments drive (will merge to shared drive later) |
| Year cannot be determined | Use fallback year (e.g., 2020) or "Unknown" folder |
| Special characters in filename | Sanitize for Google Drive compatibility |
| Very long filenames | Truncate to 255 characters |

---

## Rollback Strategy

Each phase logs operations to enable rollback:

```typescript
interface RollbackOperation {
  phase: 'rename' | 'hierarchy' | 'move' | 'merge'
  type: 'rename' | 'create' | 'move' | 'delete'
  fileId: string
  originalName?: string
  newName?: string
  sourceFolder?: string
  targetFolder?: string
  timestamp: string
}
```

Rollback commands:
```bash
# Rollback specific session
bun run cli rollback --session <session-id>

# Rollback specific phase
bun run cli rollback --session <session-id> --phase rename
```

---

## Testing Strategy

1. **Unit Tests**: Test each service in isolation with mocked Google Drive
2. **Integration Tests**: Use `TEST_4` shared drive for end-to-end testing
3. **Dry Run**: Always run with `--dry-run` first on production data
4. **Limited Run**: Test with `--limit 1` to process single agency first

---

## Implementation Order

1. [ ] `AttachmentRenamerService` - Rename files
2. [ ] `AttachmentHierarchyService` - Create folder structure  
3. [ ] Update `AttachmentMoverService` - Move files into hierarchy
4. [ ] `AttachmentOrganizerService` - Orchestrate full pipeline
5. [ ] CLI command `organize-attachments`
6. [ ] Update existing `FolderMergerService` for final merge
7. [ ] Rollback support for all phases
8. [ ] Tests for each service

---

## Decisions Made

1. **Zip files**: Extract zip contents during hierarchy creation phase
   - Download zip, extract locally, upload extracted files to hierarchy
   - Delete original zip after successful extraction

2. **Agencies marked for `create`**: Create new folders in attachments drive
   - These are agencies with no matching folder in shared drive
   - Create folder structure in attachments drive first
   - Will be moved to shared drive in merge phase

3. **Existing files in shared drive**: Use existing merge logic (skip duplicates or rename)

4. **Performance**: Batch where possible, rate limit to avoid quota issues

5. **Progress persistence**: Log processed files, skip already-processed on resume
