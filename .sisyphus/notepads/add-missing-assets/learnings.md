# Learnings - Add Missing Assets

## [2026-01-25] Implementation of Call, Lead Form, and Mobile App Assets

### Overview
Added three missing asset types to the `createCompleteCampaign` endpoint that were being extracted from the request body but had no implementation.

---

### Call Asset Implementation

**Location**: server.js lines 1052-1094

**Key Learnings**:
1. **Simple structure**: Only requires `countryCode` and `phoneNumber`
2. **Linking level**: AdGroup level via `adGroupAssets:mutate`
3. **Phone format**: Should include country code prefix (e.g., "+1-555-123-4567")
4. **Default country**: 'US' if not specified

**Pattern**:
```javascript
// 1. Create asset via assets:mutate
const callAssetResult = await makeGoogleAdsRequest({
  endpoint: 'assets:mutate',
  body: {
    operations: [{
      create: {
        callAsset: {
          countryCode: call.countryCode || 'US',
          phoneNumber: call.phoneNumber,
        }
      }
    }]
  }
});

// 2. Link to AdGroup with status ENABLED
await makeGoogleAdsRequest({
  endpoint: 'adGroupAssets:mutate',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: callAssetResourceName,
        fieldType: 'CALL',
        status: 'ENABLED',
      }
    }]
  }
});
```

---

### Lead Form Asset Implementation

**Location**: server.js lines 1096-1154

**CRITICAL FINDING**: Lead Forms can ONLY be linked at Campaign level, not AdGroup level.

**Key Learnings**:
1. **Linking level**: MUST use `campaignAssets:mutate` (not `adGroupAssets:mutate`)
2. **Required fields**: `businessName`, `privacyPolicyUrl`
3. **Fields array**: Each field needs `inputType` property
4. **Default fields**: FULL_NAME, EMAIL, PHONE_NUMBER
5. **Optional fields**: `postSubmitHeadline`, `postSubmitDescription`

**Why Campaign Level?**:
- API constraint: Lead Forms cannot be linked at AdGroup level
- Attempting to use `adGroupAssets:mutate` will fail
- This is different from other asset types (Callouts, Sitelinks, etc.)

**Pattern**:
```javascript
// 1. Build fields array
const leadFormFields = (leadForm.fields || ['FULL_NAME', 'EMAIL', 'PHONE_NUMBER']).map(field => ({
  inputType: field
}));

// 2. Create asset
const leadFormAssetResult = await makeGoogleAdsRequest({
  endpoint: 'assets:mutate',
  body: {
    operations: [{
      create: {
        leadFormAsset: {
          businessName: leadForm.businessName,
          headline: leadForm.headline || 'Contact Us',
          description: leadForm.description || 'Fill out this form...',
          privacyPolicyUrl: leadForm.privacyPolicyUrl,
          callToActionType: leadForm.callToActionType || 'LEARN_MORE',
          fields: leadFormFields,
        }
      }
    }]
  }
});

// 3. Link to CAMPAIGN (not AdGroup!)
await makeGoogleAdsRequest({
  endpoint: 'campaignAssets:mutate',  // NOT adGroupAssets!
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,  // NOT adGroup!
        asset: leadFormAssetResourceName,
        fieldType: 'LEAD_FORM',
        status: 'ENABLED',
      }
    }]
  }
});
```

---

### Mobile App Asset Implementation

**Location**: server.js lines 1156-1198

**Key Learnings**:
1. **Required fields**: `appId`, `appStore`, `linkText`
2. **App stores**: GOOGLE_APP_STORE (Android) or APPLE_APP_STORE (iOS)
3. **Link text limit**: Max 25 characters (truncated if longer)
4. **Linking level**: AdGroup level via `adGroupAssets:mutate`
5. **Default store**: GOOGLE_APP_STORE if not specified

**Pattern**:
```javascript
// 1. Create asset
const mobileAppAssetResult = await makeGoogleAdsRequest({
  endpoint: 'assets:mutate',
  body: {
    operations: [{
      create: {
        mobileAppAsset: {
          appId: mobileApp.appId,
          appStore: mobileApp.appStore || 'GOOGLE_APP_STORE',
          linkText: (mobileApp.linkText || 'Get the App').substring(0, 25),
        }
      }
    }]
  }
});

// 2. Link to AdGroup
await makeGoogleAdsRequest({
  endpoint: 'adGroupAssets:mutate',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: mobileAppAssetResourceName,
        fieldType: 'MOBILE_APP',
        status: 'ENABLED',
      }
    }]
  }
});
```

---

## Asset Linking Summary

| Asset Type | Linking Level | Endpoint | Field Type | Status Required |
|------------|---------------|----------|------------|-----------------|
| Call | AdGroup | `adGroupAssets:mutate` | CALL | ENABLED |
| **Lead Form** | **Campaign** | **`campaignAssets:mutate`** | LEAD_FORM | ENABLED |
| Mobile App | AdGroup | `adGroupAssets:mutate` | MOBILE_APP | ENABLED |
| Callout | AdGroup | `adGroupAssets:mutate` | CALLOUT | ENABLED |
| Sitelink | AdGroup | `adGroupAssets:mutate` | SITELINK | ENABLED |
| Promotion | AdGroup | `adGroupAssets:mutate` | PROMOTION | ENABLED |
| Price | AdGroup | `adGroupAssets:mutate` | PRICE | ENABLED |

**Key Insight**: Lead Form is the ONLY asset type that MUST be linked at Campaign level.

---

## Common Pattern

All asset implementations follow the same 2-step pattern:

1. **Create the asset** via `assets:mutate` with the asset-specific payload
2. **Link the asset** via `adGroupAssets:mutate` or `campaignAssets:mutate` with:
   - Resource name (adGroup or campaign)
   - Asset resource name
   - Field type (enum value)
   - Status: 'ENABLED' (CRITICAL - without this, assets won't appear in UI)

---

## Testing Notes

**Manual Verification Required**:
After implementing these assets, the user must:
1. Restart the server
2. Create a campaign with all asset types
3. Verify in Google Ads UI that assets appear

**Expected Results**:
- Call asset: Shows phone number in ad extensions
- Lead Form: Appears at Campaign level with form fields
- Mobile App: Shows app download link in ad extensions

---

## Gotchas and Best Practices

### 1. Always Set `status: 'ENABLED'`
Without this field, assets are created but don't appear in the UI. This was a bug in the previous implementation.

### 2. Lead Form Privacy Policy URL is Required
The `privacyPolicyUrl` field is mandatory for Lead Forms. Without it, the API will reject the request.

### 3. Link Text Character Limit
Mobile App `linkText` has a 25-character limit. Always truncate: `.substring(0, 25)`

### 4. Phone Number Format
Call assets should include country code prefix (e.g., "+1-555-123-4567") for proper display.

### 5. Field Type Enums are Case-Sensitive
Use exact enum values: 'CALL', 'LEAD_FORM', 'MOBILE_APP' (not 'call', 'leadForm', etc.)

---

## Commit Reference

**Hash**: `fc23ba1`
**Message**: "feat(server): add Call, Lead Form, and Mobile App asset support"

**Files Changed**:
- `server.js`: +164 lines (added 3 asset implementations)

---

## Future Enhancements

Potential improvements for future work:

1. **Error Handling**: Add try-catch blocks for each asset type to prevent one failure from blocking others
2. **Validation**: Validate phone number format, app ID format, privacy policy URL
3. **Logging**: Add more detailed logging for debugging
4. **Batch Operations**: Consider batching asset creation if multiple assets of same type
5. **Asset Reuse**: Check if assets already exist before creating duplicates

---

## Key Takeaways

1. **Lead Form is special**: Only asset type that MUST link at Campaign level
2. **Status field is critical**: Always set `status: 'ENABLED'` when linking
3. **Follow the pattern**: All assets use the same 2-step create-then-link pattern
4. **Test in UI**: API success doesn't guarantee UI visibility - always verify manually
5. **Character limits matter**: Truncate fields like `linkText` to avoid API errors
