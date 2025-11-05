# Folder Reorganization Logic Plan

## Objective
Reorganize EPIC files into proper client folder structure using Google Drive API.

## Prerequisites
- Service account access to Google Drive
- Test on BCX workspace first, then apply to TrollyCare workspace
- Client folders will be copied (not migrated) from BCX to TrollyCare

## Core Components

### 1. Folder Scanner Service
- Scan source directory for files
- Extract dates from filenames/metadata
- Return file metadata with path information

### 2. Year Resolution Service
- Extract year from file dates
- If year 2018-2023, map to 2023
- Handle multiple year folders (merge or drop into one)

### 3. Client/Product Classification Service
- Keywords mapping:
  - **PKG**: crime
  - **Work Comp**: claims, mod
- Default to year folder if uncertain

### 4. File Operations Service
- Create target folder structure
- Move files to correct locations
- Handle duplicate year folders

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

## Implementation Steps

1. **Google Drive Service Account Setup** - Request access
2. **FolderScanner Service** - List and analyze files
3. **YearResolution Service** - Map years to target folders
4. **ClientProductClassifier Service** - Categorize by keywords
5. **FileOperations Service** - Create structure and move files
6. **Orchestrator Service** - Coordinate all services
7. **CLI Interface** - Execute with dry-run option

## Special Cases
- Multiple folders with same year: merge or drop into one
- When in doubt: put in year folder only
- Focus on Client and Year subfolders (not full EPIC structure)

## Error Handling
- Permission errors for service account
- Duplicate folder names
- Invalid file paths
- Missing date information