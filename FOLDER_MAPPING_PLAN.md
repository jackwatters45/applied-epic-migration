# Google Drive Folder to Attachment Mapping Plan

## Overview
Create a mapping system between Google Drive folder names and attachment `nameOf` fields to enable proper file organization during migration.

## Current State
- ✅ Google Drive authentication and file operations implemented
- ✅ CSV extraction for attachment metadata available  
- ✅ Attachment metadata transformation service exists
- ❌ No folder-to-attachment mapping logic

## Implementation Plan

### Phase 1: Folder Discovery Service
**File**: `src/services/google-drive/folder-mapper.ts`

1. **Create Folder Discovery Service**
   - Extend existing `GoogleDriveFileService` 
   - Add method to list all folders in target directory
   - Return array of folder names and IDs

2. **Folder Listing Interface**
   ```typescript
   interface FolderInfo {
     readonly id: string;
     readonly name: string;
     readonly path: string;
   }
   ```

### Phase 2: Mapping Logic Service  
**File**: `src/services/google-drive/mapping-engine.ts`

1. **Exact Match Strategy**
   - Direct string comparison between folder names and `nameOf` fields
   - Case-insensitive matching
   - Whitespace normalization

2. **Fuzzy Match Strategy**
   - Levenshtein distance for near matches
   - Common prefix/suffix matching
   - Acronym expansion (e.g., "ABC Corp" → "ABC Corporation")

3. **Custom Rule Engine**
   - Pattern-based transformations
   - Substring matching with confidence scores
   - Manual override mappings for edge cases

### Phase 3: Mapping Configuration
**File**: `src/services/google-drive/mapping-config.ts`

1. **Mapping Rules Schema**
   ```typescript
   interface MappingRule {
     readonly pattern: RegExp;
     readonly replacement: string;
     readonly confidence: number;
   }
   ```

2. **Predefined Transformations**
   - Remove common prefixes/suffixes
   - Standardize company name formats
   - Handle special characters and encoding

### Phase 4: Integration Service
**File**: `src/services/google-drive/folder-attachment-mapper.ts`

1. **Orchestrator Service**
   - Combine folder discovery with mapping engine
   - Accept attachment metadata as input
   - Return mapping results with confidence scores

2. **Mapping Result Interface**
   ```typescript
   interface MappingResult {
     readonly attachmentName: string;
     readonly folderId: string | null;
     readonly folderName: string | null;
     readonly confidence: number;
     readonly matchType: 'exact' | 'fuzzy' | 'rule' | 'none';
   }
   ```

### Phase 5: Validation & Reporting
**File**: `src/services/google-drive/mapping-validator.ts`

1. **Validation Service**
   - Identify unmapped attachments
   - Flag low-confidence matches
   - Generate mapping statistics

2. **Reporting Interface**
   ```typescript
   interface MappingReport {
     readonly totalAttachments: number;
     readonly mappedAttachments: number;
     readonly unmappedAttachments: string[];
     readonly lowConfidenceMappings: MappingResult[];
   }
   ```

## Implementation Steps

1. **Extend Google Drive File Service**
   - Add folder-specific listing method
   - Handle pagination for large folder structures

2. **Create Mapping Engine**
   - Implement exact matching first
   - Add fuzzy matching with configurable thresholds
   - Build rule engine for custom transformations

3. **Build Configuration System**
   - Define mapping rules schema
   - Create default rule set
   - Allow runtime rule modifications

4. **Integrate with Existing Services**
   - Connect to attachment metadata transformer
   - Ensure compatibility with existing error handling
   - Follow Effect framework patterns

5. **Add Comprehensive Testing**
   - Unit tests for each matching strategy
   - Integration tests with mock Google Drive data
   - Performance tests for large datasets

## Success Criteria

- [ ] 90%+ of attachments mapped automatically
- [ ] Clear reporting of unmapped items
- [ ] Configurable matching thresholds
- [ ] Manual override capability
- [ ] Performance handles 10k+ folders
- [ ] Full test coverage
- [ ] Type safety throughout

## Next Actions

1. Create folder discovery service extending existing Google Drive operations
2. Implement basic exact matching logic
3. Build mapping result interfaces and validation
4. Add comprehensive test coverage
5. Integrate with existing attachment metadata pipeline