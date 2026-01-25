# Fix Asset Default Values

## Context

User requested:
1. Change Call default country code from US to IL
2. Change Call default phone to 0522598777
3. Add finalUrls to Mobile App asset
4. Change Mobile App default appId to com.google.android.apps.maps

---

## TODOs

- [x] 1. Update Call Asset defaults

  **Location**: server.js around line 1066

  **Find**:
  ```javascript
  callAsset: {
    countryCode: call.countryCode || 'US',
    phoneNumber: cleanPhoneNumber,
  }
  ```

  **Replace with**:
  ```javascript
  callAsset: {
    countryCode: call.countryCode || 'IL',
    phoneNumber: cleanPhoneNumber || '0522598777',
  }
  ```

  **Commit**: NO (group with task 2)

- [x] 2. Update Mobile App Asset - add finalUrls and change default appId

  **Location**: server.js around line 1187-1195

  **Find**:
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

  **Replace with**:
  ```javascript
  operations: [{
    create: {
      finalUrls: [mobileApp.finalUrl || normalizedFinalUrl],
      mobileAppAsset: {
        appId: mobileApp.appId || 'com.google.android.apps.maps',
        appStore: mobileApp.appStore || 'GOOGLE_APP_STORE',
        linkText: (mobileApp.linkText || 'Get the App').substring(0, 25),
      }
    }
  }]
  ```

  **Commit**: YES
  - Message: `fix(server): update Call and Mobile App asset defaults`
  - Files: server.js
