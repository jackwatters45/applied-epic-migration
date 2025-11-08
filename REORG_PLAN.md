# Folder Reorganization Logic Plan

## Objective
Reorganize EPIC files into proper client folder structure using Google Drive API.

## Prerequisites
- Service account access to Google Drive
- Test on BCX workspace first, then apply to TrollyCare workspace
- Client folders will be copied (not migrated) from BCX to TrollyCare

## Current Implementation Status

### ✅ Completed
- **Google Drive Auth Service** - Full authentication with service account
- **Google Drive File Service** - File listing, upload, move, create folder operations
- **Folder Reader Service** - Read folder contents with subfolder traversal
- **Folder Strategy Service** - Strategy pattern for folder determination
- **Attachment Metadata Pipeline** - Complete CSV processing pipeline
- **Year Resolution Service** - Comprehensive year extraction with 18 priority levels
- **Attachment Orchestrator** - Full metadata processing workflow

### ❌ Not Started
- **Client/Product Classification Service** - Categorize by keywords
- **Google Drive Reorganization Service** - Connect metadata to Drive operations
- **Final Reorganization Script** - One-time execution script (no CLI needed)

## Core Components

### 1. Google Drive Services ✅
- **Auth Service**: Service account authentication with caching
- **File Service**: Complete file operations (list, upload, move, create folders)
- **Folder Reader**: Recursive folder reading with subfolder support
- **Folder Strategy**: Account-based and date-based folder determination

### 2. Attachment Metadata Pipeline ✅
- **CSV Processing**: Extract, validate, transform attachment metadata
- **Deduplication**: Remove duplicate attachments by file ID
- **Year Resolution**: 18-priority year extraction system with comprehensive fallbacks
- **Orchestrator**: Complete metadata processing workflow

### 3. Missing Components ❌
- **Client/Product Classification Service**
  - Keywords mapping:
    - **PKG**: crime
    - **Work Comp**: claims, mod
  - Default to year folder if uncertain

- **Google Drive Reorganization Service**
  - Map attachment metadata to Google Drive folder structure
  - Execute file moves/copies between workspaces
  - Handle target folder creation

## Target Folder Structure
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

## Next Steps

1. **Google Drive Reorganization Service** - Connect metadata to Drive operations
2. **Final Reorganization Script** - One-time execution script
3. **Client/Product Classification Service** (Optional) - Implement keyword-based categorization

## Special Cases
- Multiple folders with same year: merge or drop into one
- When in doubt: put in year folder only
- Focus on Client and Year subfolders (not full EPIC structure)

## Error Handling
- Permission errors for service account ✅ (implemented)
- Duplicate folder names
- Invalid file paths
- Missing date information ✅ (comprehensive fallbacks implemented)