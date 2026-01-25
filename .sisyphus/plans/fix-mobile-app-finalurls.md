# Fix Mobile App Asset - Add finalUrls

## Context

### Error from Google Ads API
```
REQUIRED_NONEMPTY_LIST: The required repeated field was empty.
Location: operations[0].create.final_urls
```

### Root Cause
Mobile App assets require `finalUrls` field at the Asset level, but we didn't include it.

---

## Quick Fix

- [ ] 1. Add finalUrls to Mobile App asset creation

  **Location**: server.js line 1187-1195

  **Current code**:
  ```javascript
  operations: [{
    create: {
      mobileAppAsset: {
        appId: mobileApp.appId,
        appStore: mobileApp.appStore || 'GOOGLE_APP_STORE',
        linkText: (mobileApp.linkText || 'Get the App').substring(0, 25),
      }
    }
  }]
  ```

  **Change to**:
  ```javascript
  operations: [{
    create: {
      finalUrls: [mobileApp.finalUrl || normalizedFinalUrl],
      mobileAppAsset: {
        appId: mobileApp.appId,
        appStore: mobileApp.appStore || 'GOOGLE_APP_STORE',
        linkText: (mobileApp.linkText || 'Get the App').substring(0, 25),
      }
    }
  }]
  ```

  **Acceptance Criteria**:
  - [ ] finalUrls included in Mobile App asset payload

---

## Other Errors (NOT code bugs - account/data issues)

| Asset | Error | Reason | Action |
|-------|-------|--------|--------|
| Call | CALL_PHONE_NUMBER_NOT_SUPPORTED_FOR_COUNTRY | Fake phone `+15551234567` invalid | Use real phone or remove from test payload |
| Lead Form | LEAD_FORM_MISSING_AGREEMENT | ToS not accepted in Google Ads UI | User must accept Lead Form ToS in Google Ads UI |
| Mobile App | MOBILE_APP_INVALID_APP_ID | Fake app ID `com.example.marketing` | Use real app ID like `com.google.android.apps.maps` |

These are **not code bugs**. The implementation is correct. The errors are from invalid test data or account configuration.
