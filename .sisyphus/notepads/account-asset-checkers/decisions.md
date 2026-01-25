## [2026-01-25T15:22:18.392Z] Task: Account-Level Asset Status Checkers

### Architectural Decisions

#### Decision 1: Query customer_asset instead of asset
**Rationale**: 
- Business Name and Logo are AssetFieldType values, not AssetType values
- The `asset` table doesn't have a `type` field for 'BUSINESS_NAME' or 'LOGO'
- Account-level assets are linked via `customer_asset` resource
- This is the correct Google Ads API pattern for checking account-level asset existence

#### Decision 2: Check multiple Logo field types
**Rationale**:
- Logo can be stored as 'LOGO', 'BUSINESS_LOGO', or 'LANDSCAPE_LOGO'
- Using `IN` clause ensures we catch any logo variant
- More robust than checking single field type

#### Decision 3: No backend changes
**Rationale**:
- Existing `googleAds:search` endpoint already supports arbitrary GAQL queries
- No need to create specialized endpoints for each asset type
- Keeps backend simple and maintainable

#### Decision 4: Inline styles instead of CSS classes
**Rationale**:
- Matches existing Lead Form ToS checker pattern
- Immediate visual feedback without CSS file changes
- Self-contained component (HTML + JS only)

#### Decision 5: "Check All" convenience function
**Rationale**:
- User experience improvement - check all three at once
- Uses `Promise.all()` for parallel execution
- Faster than sequential checks

#### Decision 6: Link to Google Ads UI when missing
**Rationale**:
- These assets CANNOT be created via API
- Must guide users to Google Ads UI
- Clear call-to-action when asset is missing
