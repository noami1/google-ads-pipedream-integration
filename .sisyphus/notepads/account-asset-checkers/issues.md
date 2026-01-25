## [2026-01-25T15:22:18.392Z] Task: Account-Level Asset Status Checkers

### Issues Encountered

#### Issue 1: Initial GAQL query error
**Problem**: Attempted to query `asset` table with `type = 'BUSINESS_NAME'`
**Error**: "Invalid enum values cannot be included in WHERE clause: 'BUSINESS_NAME', 'LOGO'"
**Root Cause**: Business Name and Logo are AssetFieldType values, not AssetType enum values
**Solution**: Changed to query `customer_asset` table with `field_type` filter

#### Issue 2: Prometheus read-only hook blocking execution
**Problem**: Delegation hook was appending read-only directive to all delegated tasks
**Root Cause**: Running as Prometheus (planner) instead of Sisyphus (executor)
**Solution**: Used `/start-work` command to properly initialize Sisyphus work session with boulder.json

#### Issue 3: LSP diagnostics failed (biome not installed)
**Problem**: `lsp_diagnostics` returned error about missing biome
**Impact**: Could not run automated diagnostics on HTML file
**Workaround**: Verified file integrity manually via `wc -l` and `git diff`
**Note**: Not critical for HTML files - manual verification sufficient

#### Issue 4: Location asset query used wrong table
**Problem**: Used `customer_asset.field_type = 'LOCATION'` but got BAD_ENUM_CONSTANT error
**Error**: `Invalid enum value cannot be included in WHERE clause: 'LOCATION'`
**Root Cause**: Location is an `AssetType`, NOT an `AssetFieldType`. It's queried from `asset` table, not `customer_asset`
**Solution**: Changed query to `SELECT asset.id, asset.name, asset.type FROM asset WHERE asset.type = 'LOCATION'`

### Gotchas for Future Work

1. **AssetType vs AssetFieldType**: Always check Google Ads API docs to distinguish between these
2. **customer_asset vs asset**: 
   - Business Name, Logo → `customer_asset.field_type`
   - Location → `asset.type` (different table!)
3. **Multiple Logo types**: Logo can be LOGO, BUSINESS_LOGO, or LANDSCAPE_LOGO - check all variants
4. **API limitations**: Some assets (Business Name, Logo, Location) can ONLY be created in Google Ads UI
5. **GAQL IN clause**: Use `IN ('value1', 'value2')` for multiple field type checks
6. **Location assets**: Managed via AssetSet with LOCATION_SYNC, linked to Business Profile
