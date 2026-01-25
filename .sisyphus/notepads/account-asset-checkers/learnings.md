## [2026-01-25T15:22:18.392Z] Task: Account-Level Asset Status Checkers

### Key Learnings

#### AssetType vs AssetFieldType Distinction
- **Critical Discovery**: Business Name and Logo are NOT `AssetType` enum values
- They are `AssetFieldType` values used when linking assets to customers/campaigns
- Must query `customer_asset` resource, NOT `asset` resource
- Correct field: `customer_asset.field_type`, NOT `asset.type`

#### GAQL Query Patterns for Account-Level Assets

**Business Name**:
```sql
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type = 'BUSINESS_NAME'
```

**Logo** (multiple field types exist):
```sql
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type IN ('LOGO', 'BUSINESS_LOGO', 'LANDSCAPE_LOGO')
```

**Location**:
```sql
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type = 'LOCATION'
```

#### UI Pattern Consistency
- Followed exact same pattern as Lead Form ToS checker
- Three-state status indicators:
  - Gray (#f5f5f5) = pending/error
  - Green (#d4edda) = asset exists
  - Red (#f8d7da) = asset missing
- Inline styles for immediate visual feedback
- Error handling for missing credentials

#### Code Organization
- All check functions registered on window object for onclick handlers
- Parallel execution via `Promise.all()` for "Check All" button
- Consistent error messaging across all three checkers

### Conventions Established
- Status checker functions follow pattern: `check{AssetName}()`
- DOM element IDs follow pattern: `{asset-name}-status` and `{asset-name}-text`
- All GAQL queries include `customer_asset.status` field for future extensibility
- Link to Google Ads UI provided when asset is missing
