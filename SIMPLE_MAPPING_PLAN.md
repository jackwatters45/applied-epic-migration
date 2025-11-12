# Simple Folder Mapping Implementation Plan

## Current State

- We have a simplified `FolderHierarchyService` that gets all folders from Google Drive using `sharedDriveId`
- Need to build basic folder mapping functionality
- Focus on simple map structure: key is folder name, value contains folder info and contents

## Implementation Plan

### Phase 1: Get All Folders

1. **Use Existing FolderHierarchyService**
   - Use `FolderHierarchyService.getAllFolders()` with sharedDriveId
   - Ensure we get all folders in the shared drive, not just root
   - Return a simple array of folder objects with basic info

2. **Basic Folder Data Structure**
   - Focus on essential fields: id, name, parentId
   - Keep it simple - no complex hierarchy calculations initially
   - Just get the raw folder data first

### Phase 2: Build Simple Map

1. **Create Basic Folder Map**
   - Map<string, FolderInfo> where key is folder name
   - Value contains: id, name, parentId, basic metadata
   - No complex relationships initially

2. **Add Basic Organization Logic**
   - Group folders by name patterns
   - Identify potential year-based folders (2023, 2024, etc.)
   - Simple categorization by folder naming conventions

### Phase 3: Add Contents Logic

1. **Get Folder Contents**
   - For each folder, get its files/subfolders
   - Add contents array to folder info
   - Build simple parent-child relationships

2. **Simple Arrangement Logic**
   - Basic folder sorting (alphabetical, by date, etc.)
   - Group similar folders together
   - Identify folder patterns for reorganization

### Phase 4: Testing & Validation

1. **Test with Real Data**
   - Run against actual Google Drive shared drive
   - Verify folder count matches expectations
   - Check that folder contents are retrieved correctly

2. **Performance Check**
   - Ensure it handles large folder structures
   - Monitor API usage

## Technical Details

### Basic FolderInfo Interface

```typescript
interface FolderInfo {
  id: string;
  name: string;
  parentId?: string;
  contents?: string[]; // IDs of child folders/files
  level?: number; // Simple hierarchy depth
}
```

### Key Functions

1. `getAllFolders()` - Get all folders from Google Drive
2. `buildFolderMap()` - Create simple name-based map
3. `getFolderContents()` - Get contents for specific folders
4. `analyzeFolders()` - Basic pattern analysis
5. `organizeFolders()` - Simple arrangement logic

### Effect Service Dependencies

- `FolderHierarchyService` - Main service for folder operations
- `ConfigService` - For sharedDriveId
- `GoogleDriveFileService` - Underlying file operations

## Next Steps

1. Test the basic folder retrieval from `FolderHierarchyService`
2. Build simple name-based folder map
3. Add basic folder analysis functionality
4. Implement simple organization logic
5. Validate with real Google Drive data

## Files to Create/Modify

- `src/services/mapping/basic-folder-mapper.ts` - New simple mapper
- Test script to validate functionality
- Update any dependent services that need folder mapping

## Success Criteria

- Successfully retrieve all folders from shared drive
- Build simple folder map by name
- Basic folder analysis working
- Simple organization logic implemented
- No TypeScript compilation errors
- Works with real Google Drive data
