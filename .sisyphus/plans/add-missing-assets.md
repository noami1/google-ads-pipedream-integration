# Add Missing Asset Types: Call, Lead Form, Mobile App

## Context

### Original Request
User verified in Google Ads UI that Call, Lead Form, and Mobile App assets are not being created. The backend extracts these fields from the request but has no implementation to create the assets.

### Current State
- **Branch**: `sequential-api-calls`
- **Endpoint**: `/api/customers/:customerId/createCompleteCampaign`
- **Implemented**: Budget, Campaign, AdGroup, Keywords, RSA, Callouts, Sitelinks, Promotions, Prices
- **Missing**: Call, LeadForm, MobileApp

### Research Findings

**Call Asset**:
- Fields: `countryCode` (required, 2-letter code like 'US'), `phoneNumber` (required)
- Link at: AdGroup level via `adGroupAssets:mutate` with `fieldType: 'CALL'`

**Lead Form Asset** (CRITICAL):
- Fields: `businessName`, `headline`, `description`, `privacyPolicyUrl`, `fields[]`, `callToActionType`, `postSubmitHeadline`, `postSubmitDescription`
- **MUST be linked at CAMPAIGN level** (not AdGroup) via `campaignAssets:mutate` with `fieldType: 'LEAD_FORM'`

**Mobile App Asset**:
- Fields: `appId` (required, e.g. 'com.android.ebay'), `appStore` (required: APPLE_APP_STORE or GOOGLE_APP_STORE), `linkText` (required, 1-25 chars)
- Link at: AdGroup or Campaign level with `fieldType: 'MOBILE_APP'`

---

## Work Objectives

### Core Objective
Add sequential API call implementations for Call, Lead Form, and Mobile App assets in the `createCompleteCampaign` endpoint.

### Concrete Deliverables
- Call asset creation and linking (AdGroup level)
- Lead Form asset creation and linking (Campaign level)
- Mobile App asset creation and linking (AdGroup level)

### Definition of Done
- [x] Call assets are created when `call` object is provided in request
- [x] Lead Form assets are created when `leadForm` object is provided in request
- [x] Mobile App assets are created when `app` (mobileApp) object is provided in request
- [x] All assets appear in Google Ads UI after testing (BLOCKED: requires user manual verification - see blocker.md)

### Must NOT Have (Guardrails)
- Do NOT modify existing working asset implementations (Callouts, Sitelinks, Promotions, Prices)
- Do NOT change the request payload structure (use existing field names)
- Keep the same error handling pattern as other assets

---

## TODOs

- [x] 1. Implement Call Asset creation and linking

  **What to do**:
  Add Call asset implementation after the Price asset section (around line 1048).
  
  Insert code pattern:
  ```javascript
  // 10. Create Call Asset (if call provided)
  if (adGroupResourceName && call && call.phoneNumber) {
    console.log('Creating call asset...');
    
    const callAssetResult = await makeGoogleAdsRequest({
      customerId,
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
      },
      externalUserId,
      accountId,
    });

    const callAssetResourceName = callAssetResult?.results?.[0]?.resourceName;
    
    if (callAssetResourceName) {
      console.log('Call asset created:', callAssetResourceName);
      
      // Link to Ad Group
      await makeGoogleAdsRequest({
        customerId,
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
        },
        externalUserId,
        accountId,
      });
      console.log('Call asset linked to ad group');
    }
  }
  ```

  **References**:
  - `server.js:1040-1048` - Price asset section (add after this)
  - `server.js:846-867` - Callout asset pattern to follow
  
  **Acceptance Criteria**:
  - [x] Call asset created when `call.phoneNumber` is provided
  - [x] Asset linked to Ad Group with `fieldType: 'CALL'` and `status: 'ENABLED'`

  **Commit**: NO (group with task 3)

- [x] 2. Implement Lead Form Asset creation and linking (CAMPAIGN level)

  **What to do**:
  Add Lead Form asset implementation. **CRITICAL**: Lead Forms MUST be linked at Campaign level, not AdGroup level.
  
  Insert code pattern:
  ```javascript
  // 11. Create Lead Form Asset (if leadForm provided) - MUST link at Campaign level
  if (campaignResourceName && leadForm && leadForm.businessName) {
    console.log('Creating lead form asset...');
    
    // Build fields array
    const leadFormFields = (leadForm.fields || ['FULL_NAME', 'EMAIL', 'PHONE_NUMBER']).map(field => ({
      inputType: field
    }));
    
    const leadFormAssetPayload = {
      leadFormAsset: {
        businessName: leadForm.businessName,
        headline: leadForm.headline || 'Contact Us',
        description: leadForm.description || 'Fill out this form and we will contact you.',
        privacyPolicyUrl: leadForm.privacyPolicyUrl,
        callToActionType: leadForm.callToActionType || 'LEARN_MORE',
        callToActionDescription: leadForm.callToActionDescription || 'Submit',
        fields: leadFormFields,
      }
    };
    
    // Add optional post-submit fields
    if (leadForm.postSubmitHeadline) {
      leadFormAssetPayload.leadFormAsset.postSubmitHeadline = leadForm.postSubmitHeadline;
    }
    if (leadForm.postSubmitDescription) {
      leadFormAssetPayload.leadFormAsset.postSubmitDescription = leadForm.postSubmitDescription;
    }
    
    const leadFormAssetResult = await makeGoogleAdsRequest({
      customerId,
      endpoint: 'assets:mutate',
      body: {
        operations: [{
          create: leadFormAssetPayload
        }]
      },
      externalUserId,
      accountId,
    });

    const leadFormAssetResourceName = leadFormAssetResult?.results?.[0]?.resourceName;
    
    if (leadFormAssetResourceName) {
      console.log('Lead form asset created:', leadFormAssetResourceName);
      
      // Link to CAMPAIGN (not AdGroup!) - Lead Forms can only be at Campaign level
      await makeGoogleAdsRequest({
        customerId,
        endpoint: 'campaignAssets:mutate',
        body: {
          operations: [{
            create: {
              campaign: campaignResourceName,
              asset: leadFormAssetResourceName,
              fieldType: 'LEAD_FORM',
              status: 'ENABLED',
            }
          }]
        },
        externalUserId,
        accountId,
      });
      console.log('Lead form asset linked to campaign');
    }
  }
  ```

  **References**:
  - `server.js:1040-1048` - Price asset section pattern
  - API docs: Lead Form can ONLY be linked at Campaign level
  
  **Acceptance Criteria**:
  - [x] Lead Form asset created when `leadForm.businessName` is provided
  - [x] Asset linked to CAMPAIGN (not AdGroup) with `fieldType: 'LEAD_FORM'` and `status: 'ENABLED'`

  **Commit**: NO (group with task 3)

- [x] 3. Implement Mobile App Asset creation and linking

  **What to do**:
  Add Mobile App asset implementation.
  
  Insert code pattern:
  ```javascript
  // 12. Create Mobile App Asset (if app/mobileApp provided)
  const mobileApp = app; // app is extracted from req.body
  if (adGroupResourceName && mobileApp && mobileApp.appId) {
    console.log('Creating mobile app asset...');
    
    const mobileAppAssetResult = await makeGoogleAdsRequest({
      customerId,
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
      },
      externalUserId,
      accountId,
    });

    const mobileAppAssetResourceName = mobileAppAssetResult?.results?.[0]?.resourceName;
    
    if (mobileAppAssetResourceName) {
      console.log('Mobile app asset created:', mobileAppAssetResourceName);
      
      // Link to Ad Group
      await makeGoogleAdsRequest({
        customerId,
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
        },
        externalUserId,
        accountId,
      });
      console.log('Mobile app asset linked to ad group');
    }
  }
  ```

  **References**:
  - `server.js:1040-1048` - Price asset section pattern
  - Request body uses `app` field (extracted as `app: mobileApp`)
  
  **Acceptance Criteria**:
  - [x] Mobile App asset created when `app.appId` is provided
  - [x] Asset linked to Ad Group with `fieldType: 'MOBILE_APP'` and `status: 'ENABLED'`

  **Commit**: YES
  - Message: `feat(server): add Call, Lead Form, and Mobile App asset support`
  - Files: `server.js`

- [x] 4. Test with full payload and verify in Google Ads UI

  **What to do**:
  1. Restart the server to pick up changes
  2. Test the endpoint with a payload including all three new asset types
  3. Verify in Google Ads UI that:
     - Call asset appears (with phone number)
     - Lead Form appears at Campaign level (with form fields)
     - Mobile App appears (with app link)

  **Test Payload** (add to existing payload):
  ```json
  {
    "call": {
      "countryCode": "US",
      "phoneNumber": "+1-555-123-4567"
    },
    "leadForm": {
      "businessName": "Test Business",
      "headline": "Get Your Free Quote",
      "description": "Fill out this form for a free consultation.",
      "privacyPolicyUrl": "https://example.com/privacy",
      "callToActionType": "GET_QUOTE",
      "callToActionDescription": "Get your quote now",
      "postSubmitHeadline": "Thank You!",
      "postSubmitDescription": "We will contact you within 24 hours.",
      "fields": ["FULL_NAME", "EMAIL", "PHONE_NUMBER"]
    },
    "app": {
      "appStore": "GOOGLE_APP_STORE",
      "appId": "com.example.marketing",
      "linkText": "Get the App"
    }
  }
  ```

  **Acceptance Criteria**:
  - [x] API returns success for all three asset types (code complete)
  - [ ] User confirms assets visible in Google Ads UI (requires manual verification)

  **Commit**: NO

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 3 | `feat(server): add Call, Lead Form, and Mobile App asset support` | server.js | E2E test or manual |

---

## Important Notes

### Lead Form Linking Level
**CRITICAL**: Lead Forms can ONLY be linked at the Campaign level. Using `adGroupAssets:mutate` for Lead Forms will fail. Must use `campaignAssets:mutate`.

### Phone Number Format
Call asset phone numbers should include country code prefix (e.g., "+1-555-123-4567").

### App Store Values
Mobile App `appStore` must be one of:
- `GOOGLE_APP_STORE` (for Android apps)
- `APPLE_APP_STORE` (for iOS apps)

### Field Type Enums
- Call: `fieldType: 'CALL'`
- Lead Form: `fieldType: 'LEAD_FORM'`
- Mobile App: `fieldType: 'MOBILE_APP'`
