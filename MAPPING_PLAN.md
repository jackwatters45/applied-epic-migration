# Agency Mapping Implementation Plan

## Goal

Match every agency name (from attachment metadata) to a Google Drive folder ID. Persist mappings for later file moves.

## Data Flow

```
Attachment Metadata (nameOf) → Match → Google Drive Folder (id, name)
```

## Phases

### Phase 1: Agency Mapping Store

**New file:** `src/services/mapping/agency-mapping-store.ts`

```typescript
type AgencyMapping = {
  folderId: string;
  folderName: string;
  confidence: number;
  matchType: "exact" | "auto" | "manual";
  reasoning: string; // Why this match was made
  matchedAt: string; // When the match was made
  reviewedAt?: string; // When manually reviewed (if applicable)
};
```

Methods:

- `load()` - Read from `data/agency-mappings.json`
- `save()` - Persist mappings
- `get(agencyName)` - Lookup single agency
- `set(agencyName, mapping)` - Set/override mapping
- `getUnmapped(allAgencies)` - Return agencies without mappings
- `getPendingReview()` - Return mappings needing review (<90% confidence)

### Phase 2: Update Mapper Flow

**Update:** `src/services/mapping/attachment-folder-mapper.ts`

1. Load existing mappings (preserves manual overrides)
2. For unmapped agencies: run matching algorithm
3. Confidence thresholds:
   - **≥90%**: Auto-accept as `matchType: "auto"` (or `"exact"` if 100%)
   - **<90%**: Flag for review
4. Save updated mappings

### Phase 3: Review CLI Command

**Update:** `src/index.ts`

Add `review` subcommand:

- Show all non-exact matches for review
- Display candidates with scores and reasoning
- Accept selection or manual folder ID input
- Save decisions as `matchType: "manual"`

### Output Files

- `data/agency-mappings.json` - Persistent mapping store
- `logs/agency-mapping-report.json` - Detailed match report
