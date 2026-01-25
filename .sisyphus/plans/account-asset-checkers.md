# Account-Level Asset Status Checkers

## Context

### Original Request
Add visual status indicators for account-level assets that are required by Google Ads but can only be created in the Google Ads UI:
1. **Business Name** - Required asset
2. **Logo** - Required asset  
3. **Location Asset** - Required asset

These show warnings in Google Ads UI: "To unlock this format, add the following assets: 1 business name / 1 logo / 1 location asset"

### Research Findings

**Key Insight**: Business Name and Logo are NOT separate `AssetType` enum values - they are `AssetFieldType` values!

| What You Want | AssetType | AssetFieldType | How to Query |
|---------------|-----------|----------------|--------------|
| **Business Name** | `TEXT` | `BUSINESS_NAME` | Query `customer_asset` with `field_type = 'BUSINESS_NAME'` |
| **Logo** | `IMAGE` | `LOGO` or `BUSINESS_LOGO` or `LANDSCAPE_LOGO` | Query `customer_asset` with `field_type IN ('LOGO', 'BUSINESS_LOGO', 'LANDSCAPE_LOGO')` |
| **Location** | `LOCATION` | `LOCATION` | Query `customer_asset` with `field_type = 'LOCATION'` |

**Correct GAQL Queries:**

```sql
-- Check Business Name
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type = 'BUSINESS_NAME'

-- Check Logo (multiple field types)
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type IN ('LOGO', 'BUSINESS_LOGO', 'LANDSCAPE_LOGO')

-- Check Location
SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
FROM customer_asset 
WHERE customer_asset.field_type = 'LOCATION'
```

---

## Work Objectives

### Core Objective
Add three status checker buttons to the frontend that query Google Ads API to determine if account-level assets (Business Name, Logo, Location) exist.

### Concrete Deliverables
- New UI section "Account-Level Assets" in `public/index.html`
- Three status indicator rows with "Check" buttons
- Three JavaScript functions: `checkBusinessName()`, `checkLogo()`, `checkLocationAsset()`
- One convenience function: `checkAllAccountAssets()`

### Definition of Done
- [x] All three status checkers show ✅ green when asset exists
- [x] All three status checkers show ❌ red with Google Ads link when asset missing
- [x] "Check All" button triggers all three checks

### Must Have
- Status indicators follow exact same UI pattern as Lead Form ToS checker
- GAQL queries use `customer_asset` resource with correct `field_type` filters
- Error handling for missing credentials (customer not selected)
- Link to Google Ads UI when asset is missing

### Must NOT Have (Guardrails)
- Do NOT attempt to create these assets via API (they must be created in Google Ads UI)
- Do NOT query `asset` table with `type = 'BUSINESS_NAME'` (that enum doesn't exist)
- Do NOT add backend changes - reuse existing `googleAds:search` endpoint

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (frontend-only, manual verification)
- **User wants tests**: Manual-only
- **QA approach**: Manual verification via browser

---

## TODOs

- [x] 1. Add Account-Level Assets UI Section

  **What to do**:
  - Add new form section BEFORE Lead Form section (around line 959)
  - Section title: "ACCOUNT-LEVEL ASSETS" with badge "INFO"
  - Add explanatory text: "These assets must be created in Google Ads UI. Check if they exist:"
  - Add three status indicator divs following the Lead Form ToS pattern:
    - `business-name-status` / `business-name-text` 
    - `logo-status` / `logo-text`
    - `location-asset-status` / `location-asset-text`
  - Add "Check All Account Assets" button at bottom

  **Must NOT do**:
  - Do not modify Lead Form section
  - Do not add input fields (these are read-only status checks)

  **Parallelizable**: NO (must be done before JS functions)

  **References**:

  **Pattern References**:
  - `public/index.html:964-968` - Lead Form ToS status indicator UI pattern (exact structure to follow)
  - `public/index.html:959-963` - Form section title with badge pattern

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [x] Open `http://localhost:3000` in browser
  - [x] Scroll to campaign creation form
  - [x] Verify new "ACCOUNT-LEVEL ASSETS" section appears BEFORE Lead Form section
  - [x] Verify three status rows are visible with "Check" buttons
  - [x] Verify "Check All Account Assets" button is visible

  **Commit**: NO (groups with task 2)

---

- [x] 2. Add JavaScript Status Check Functions

  **What to do**:
  - Add `checkBusinessName()` function after `checkLeadFormToS()` (around line 1743)
  - Add `checkLogo()` function
  - Add `checkLocationAsset()` function
  - Add `checkAllAccountAssets()` convenience function
  - Register all functions on window object

  **Function Pattern** (follow `checkLeadFormToS` exactly):
  ```javascript
  async function checkBusinessName() {
    const statusEl = document.getElementById('business-name-status');
    const textEl = document.getElementById('business-name-text');
    
    const customerId = selectedCustomerId;
    const externalUserId = currentUserId;
    const accountId = selectedAccountId;
    
    if (!customerId || !externalUserId || !accountId) {
      textEl.innerHTML = '⚠️ Select an account and customer above first';
      textEl.style.color = '#666';
      statusEl.style.background = '#f5f5f5';
      return;
    }
    
    textEl.innerHTML = 'Checking...';
    textEl.style.color = '#666';
    
    try {
      const response = await fetch(
        `/api/customers/${customerId}/googleAds:search?externalUserId=${encodeURIComponent(externalUserId)}&accountId=${encodeURIComponent(accountId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `SELECT customer_asset.asset, customer_asset.field_type, customer_asset.status 
                    FROM customer_asset 
                    WHERE customer_asset.field_type = 'BUSINESS_NAME'`
          })
        }
      );
      
      if (!response.ok) throw new Error('Failed to check');
      
      const data = await response.json();
      const hasAsset = data.results && data.results.length > 0;
      
      if (hasAsset) {
        textEl.innerHTML = '✅ <strong>Business Name</strong> - Asset exists';
        textEl.style.color = '#155724';
        statusEl.style.background = '#d4edda';
      } else {
        textEl.innerHTML = '❌ <strong>Business Name</strong> - Missing. <a href="https://ads.google.com" target="_blank" style="color:#721c24;">Add in Google Ads UI</a>';
        textEl.style.color = '#721c24';
        statusEl.style.background = '#f8d7da';
      }
    } catch (err) {
      textEl.innerHTML = '⚠️ Could not check Business Name status';
      textEl.style.color = '#666';
      statusEl.style.background = '#f5f5f5';
    }
  }
  ```

  **GAQL Queries to use**:
  - Business Name: `WHERE customer_asset.field_type = 'BUSINESS_NAME'`
  - Logo: `WHERE customer_asset.field_type IN ('LOGO', 'BUSINESS_LOGO', 'LANDSCAPE_LOGO')`
  - Location: `WHERE customer_asset.field_type = 'LOCATION'`

  **checkAllAccountAssets()**:
  ```javascript
  async function checkAllAccountAssets() {
    await Promise.all([
      checkBusinessName(),
      checkLogo(),
      checkLocationAsset()
    ]);
  }
  ```

  **Must NOT do**:
  - Do not modify `checkLeadFormToS` function
  - Do not add new backend endpoints
  - Do not use `asset.type` (use `customer_asset.field_type` instead)

  **Parallelizable**: NO (depends on task 1)

  **References**:

  **Pattern References**:
  - `public/index.html:1689-1743` - Complete `checkLeadFormToS()` function (exact pattern to follow)
  - `public/index.html:1711-1721` - Fetch call pattern with GAQL query
  - `public/index.html:1728-1736` - Success/failure status update pattern

  **Acceptance Criteria**:

  **Manual Execution Verification:**
  - [x] Start server: `node server.js`
  - [x] Open `http://localhost:3000` in browser
  - [x] Set User ID and connect a Google Ads account
  - [x] Select a customer from the list
  - [x] Click "Check" button for Business Name
    - Verify: Shows ✅ green if asset exists OR ❌ red if missing
  - [x] Click "Check" button for Logo
    - Verify: Shows ✅ green if asset exists OR ❌ red if missing
  - [x] Click "Check" button for Location Asset
    - Verify: Shows ✅ green if asset exists OR ❌ red if missing
  - [x] Click "Check All Account Assets" button
    - Verify: All three status indicators update

  **Commit**: YES
  - Message: `feat(frontend): add account-level asset status checkers`
  - Files: `public/index.html`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 2 | `feat(frontend): add account-level asset status checkers` | public/index.html | Manual browser test |

---

## Success Criteria

### Verification Commands
```bash
node server.js  # Start server
# Open http://localhost:3000 in browser
# Test all three status checkers
```

### Final Checklist
- [x] Business Name checker works (✅/❌ status)
- [x] Logo checker works (✅/❌ status)
- [x] Location Asset checker works (✅/❌ status)
- [x] Check All button triggers all three
- [x] Missing assets show link to Google Ads UI
- [x] Error state shown when no customer selected
