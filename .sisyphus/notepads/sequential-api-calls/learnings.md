# Learnings - Sequential API Calls

## [2026-01-25] Asset Linking Fixes

### Issue 1: Missing `status: 'ENABLED'` in AdGroupAsset linking
**Problem**: Assets were created but not appearing in Google Ads UI.

**Root Cause**: When linking assets to Ad Groups via `adGroupAssets:mutate`, the `status: 'ENABLED'` field was missing.

**Fix**: Added `status: 'ENABLED'` to all asset linking operations:
- Callouts (line 858)
- Sitelinks (line 911)
- Promotions (line 972)
- Prices (line 1028)

**Commit**: `7efedf7` - "fix(server): add status ENABLED to asset linking operations"

---

### Issue 2: PRICES - Field name mismatch
**Problem**: Price assets were NEVER created despite API returning success.

**Root Cause**: Code checked for `prices.header && prices.items?.length > 0`, but:
- Payload sends `prices.offerings` (NOT `items`)
- No `header` field at top level

**Fix**: Changed condition to support both naming conventions:
```javascript
const priceItems = prices?.items || prices?.offerings;
if (adGroupResourceName && prices && priceItems?.length > 0) {
```

---

### Issue 3: PRICES - Nested price structure mismatch
**Problem**: Price values were incorrect or missing.

**Root Cause**: Code expected flat structure:
```javascript
item.price  // number
item.currencyCode  // string
```

But payload sends nested structure:
```javascript
item.price.amount  // nested!
item.price.currencyCode  // nested!
```

**Fix**: Added logic to handle both formats:
```javascript
const priceAmount = typeof item.price === 'object' ? item.price.amount : item.price;
const currencyCode = typeof item.price === 'object' ? item.price.currencyCode : (item.currencyCode || 'USD');
```

---

### Issue 4: PROMOTION - Missing occasion field
**Problem**: Promotion occasion (e.g., NEW_YEARS, CHRISTMAS) was not being passed to API.

**Fix**: Added occasion field handling:
```javascript
if (promotion.occasion) {
  promotionAssetPayload.promotionAsset.occasion = promotion.occasion;
}
```

**Commit**: `b63dff2` - "fix(server): fix prices payload handling and add promotion occasion support"

---

## Key Takeaways

1. **Always set `status: 'ENABLED'`** when linking assets via `adGroupAssets:mutate` or `campaignAssets:mutate`
2. **Support multiple payload formats** for backward compatibility (items vs offerings, flat vs nested)
3. **Test with actual payloads** from the UI to catch mismatches between code expectations and real data
4. **Google Ads API is strict** - missing required fields or wrong enum values cause silent failures

---

## Testing Notes

**Test Developer Token Limitations**:
- Rate limit: 10 requests per minute (6.5s delay between requests)
- Batch jobs fail silently on asset creation
- Sequential API calls are more reliable for testing

**Manual Verification Required**:
After running the endpoint, check Google Ads UI for:
- Sitelinks appear under Ad Group
- Promotions are applied (not just in shared library)
- Callouts appear for specific Ad Group
- Prices show correct values
