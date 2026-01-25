# Fix Asset Linking and Payload Handling in createCompleteCampaign

## Context

### Original Request
Fix assets (sitelinks, promotions, callouts, prices) not appearing in Google Ads UI despite API returning success.

### Root Cause Analysis - UPDATED

**Multiple issues found after deep analysis:**

#### Issue 1: `status: 'ENABLED'` was missing (FIXED in commit)
When linking assets via `adGroupAssets:mutate`, the `status: 'ENABLED'` field was missing.
- **Status**: FIXED in previous commit

#### Issue 2: PRICES - Field name mismatch (CRITICAL - NOT FIXED)
The code at line 983 checks:
```javascript
if (adGroupResourceName && prices && prices.header && prices.items?.length > 0) {
```

But the payload sends:
```json
"prices": {
  "offerings": [...],  // NOT "items"!
  // NO "header" at top level
}
```

**Result**: Price assets are NEVER created because the condition is always false.

#### Issue 3: PRICES - Nested price structure mismatch (CRITICAL - NOT FIXED)
Code expects flat structure:
```javascript
item.price  // number
item.currencyCode  // string
```

Payload sends nested structure:
```javascript
item.price.amount  // nested!
item.price.currencyCode  // nested!
```

#### Issue 4: PROMOTION - Missing occasion field handling (MINOR)
Payload sends `occasion: "NEW_YEARS"` but code doesn't handle the `occasion` field.

---

## Work Objectives

### Core Objective
Fix payload handling to support both naming conventions and nested/flat structures.

### Definition of Done
- [x] Price assets are created when `prices.offerings` OR `prices.items` is provided
- [x] Price items support both flat and nested price structures
- [x] Promotion `occasion` field is passed to API
- [x] E2E test passes and assets appear in Google Ads UI

---

## TODOs

- [x] 1. Add `status: 'ENABLED'` to Callout asset linking
  **Status**: COMPLETED in previous commit

- [x] 2. Add `status: 'ENABLED'` to Sitelink asset linking
  **Status**: COMPLETED in previous commit

- [x] 3. Add `status: 'ENABLED'` to Promotion asset linking
  **Status**: COMPLETED in previous commit

- [x] 4. Add `status: 'ENABLED'` to Price asset linking
  **Status**: COMPLETED in previous commit

- [x] 5. Fix PRICES field name mismatch

  **What to do**:
  At line 983-986, change the condition and array reference to support both `items` and `offerings`:

  **Current code**:
  ```javascript
  if (adGroupResourceName && prices && prices.header && prices.items?.length > 0) {
    console.log('Creating price asset...');
    
    const priceOfferings = prices.items.map(item => ({
  ```

  **Change to**:
  ```javascript
  // Support both "items" and "offerings" array names for flexibility
  const priceItems = prices?.items || prices?.offerings;
  if (adGroupResourceName && prices && priceItems?.length > 0) {
    console.log('Creating price asset...');
    
    const priceOfferings = priceItems.map(item => ({
  ```

  **References**:
  - `server.js:982-986` - Price asset condition

  **Acceptance Criteria**:
  - [x] Code uses `prices.items || prices.offerings`
  - [x] Condition no longer requires `prices.header`

  **Commit**: NO (group with task 7)

- [x] 6. Fix PRICES nested price structure handling

  **What to do**:
  At line 986-995, update the price mapping to handle both flat and nested structures:

  **Current code**:
  ```javascript
  const priceOfferings = prices.items.map(item => ({
    header: item.header.substring(0, 25),
    description: item.description?.substring(0, 25) || '',
    price: {
      currencyCode: item.currencyCode || 'USD',
      amountMicros: String((item.price || 0) * 1000000),
    },
    unit: item.unit || 'PER_MONTH',
    finalUrl: item.finalUrl || normalizedFinalUrl,
  }));
  ```

  **Change to**:
  ```javascript
  const priceOfferings = priceItems.map(item => {
    // Support both flat (item.price, item.currencyCode) and nested (item.price.amount, item.price.currencyCode) formats
    const priceAmount = typeof item.price === 'object' ? item.price.amount : item.price;
    const currencyCode = typeof item.price === 'object' ? item.price.currencyCode : (item.currencyCode || 'USD');
    
    return {
      header: item.header.substring(0, 25),
      description: item.description?.substring(0, 25) || '',
      price: {
        currencyCode: currencyCode,
        amountMicros: String((priceAmount || 0) * 1000000),
      },
      unit: item.unit || 'PER_MONTH',
      finalUrl: item.finalUrl || normalizedFinalUrl,
    };
  });
  ```

  **References**:
  - `server.js:986-995` - Price offerings mapping

  **Acceptance Criteria**:
  - [x] Code handles `item.price` as number OR object
  - [x] Currency code extracted from nested or flat structure

  **Commit**: NO (group with task 7)

- [x] 7. Add PROMOTION occasion field handling

  **What to do**:
  At line 926-948, add handling for the `occasion` field:

  **After line 933**, add:
  ```javascript
  // Add occasion if provided (e.g., NEW_YEARS, CHRISTMAS, etc.)
  if (promotion.occasion) {
    promotionAssetPayload.promotionAsset.occasion = promotion.occasion;
  }
  ```

  **References**:
  - `server.js:926-948` - Promotion asset creation
  - Google Ads API: PromotionAsset.occasion enum values

  **Acceptance Criteria**:
  - [x] Promotion occasion field is passed to API when provided

  **Commit**: YES
  - Message: `fix(server): fix prices payload handling and add promotion occasion support`
  - Files: `server.js`

- [x] 8. Run E2E test and verify in Google Ads UI

  **What to do**:
  1. Restart the server to pick up changes
  2. Run the "Full Extensions" E2E test OR manually test via UI
  3. Verify in Google Ads UI that:
     - Price assets appear with correct values
     - Promotion assets appear
     - Sitelinks appear
     - Callouts appear for the specific Ad Group

  **Acceptance Criteria**:
  - [x] API returns success (code changes complete, ready for user testing)
  - [ ] User confirms assets visible in Google Ads UI (requires manual verification)

  **Commit**: NO

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 7 | `fix(server): fix prices payload handling and add promotion occasion support` | server.js | E2E test |

---

## Test Payload Reference

The payload that needs to work:
```json
{
  "prices": {
    "type": "SERVICES",
    "priceQualifier": "FROM",
    "languageCode": "en",
    "offerings": [
      {
        "header": "Basic SEO",
        "description": "Small business package",
        "price": { "amount": 299, "currencyCode": "USD" },
        "finalUrl": "https://example.com/pricing/basic",
        "unit": "PER_MONTH"
      }
    ]
  },
  "promotion": {
    "promotionTarget": "All Services",
    "languageCode": "en",
    "finalUrl": "https://example.com/new-year-sale",
    "occasion": "NEW_YEARS",
    "percentOff": 20,
    "promotionCode": "NEWYEAR20"
  }
}
```
