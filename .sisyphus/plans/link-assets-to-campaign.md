# Link All Assets to Campaign Level (Like Lead Form)

## Context

### Problem
Only Lead Form shows as linked in Google Ads UI. All other assets (Sitelinks, Callouts, Promotions, Prices, Calls, Mobile App) are created but NOT linked.

### Root Cause
Lead Form uses `campaignAssets:mutate` with `campaign: campaignResourceName`
All others use `adGroupAssets:mutate` with `adGroup: adGroupResourceName`

### Solution
Change all assets to link at **Campaign level** using `campaignAssets:mutate`

---

## TODOs

- [ ] 1. Change Sitelinks to link at Campaign level

  **Location**: server.js around line 900-916

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: assetResourceName,
        fieldType: 'SITELINK',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: assetResourceName,
        fieldType: 'SITELINK',
  ```

  **Commit**: NO (group with others)

- [ ] 2. Change Callouts to link at Campaign level

  **Location**: server.js around line 855-865

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: assetResourceName,
        fieldType: 'CALLOUT',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: assetResourceName,
        fieldType: 'CALLOUT',
  ```

  **Commit**: NO (group with others)

- [ ] 3. Change Promotions to link at Campaign level

  **Location**: server.js around line 970-980

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: assetResourceName,
        fieldType: 'PROMOTION',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: assetResourceName,
        fieldType: 'PROMOTION',
  ```

  **Commit**: NO (group with others)

- [ ] 4. Change Prices to link at Campaign level

  **Location**: server.js around line 1040-1050

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: assetResourceName,
        fieldType: 'PRICE',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: assetResourceName,
        fieldType: 'PRICE',
  ```

  **Commit**: NO (group with others)

- [ ] 5. Change Call to link at Campaign level

  **Location**: server.js around line 1080-1095

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: callAssetResourceName,
        fieldType: 'CALL',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: callAssetResourceName,
        fieldType: 'CALL',
  ```

  **Commit**: NO (group with others)

- [ ] 6. Change Mobile App to link at Campaign level

  **Location**: server.js around line 1210-1225

  **Find**:
  ```javascript
  path: `/customers/${customerId}/adGroupAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        adGroup: adGroupResourceName,
        asset: mobileAppAssetResourceName,
        fieldType: 'MOBILE_APP',
  ```

  **Replace with**:
  ```javascript
  path: `/customers/${customerId}/campaignAssets:mutate`,
  method: 'POST',
  body: {
    operations: [{
      create: {
        campaign: campaignResourceName,
        asset: mobileAppAssetResourceName,
        fieldType: 'MOBILE_APP',
  ```

  **Commit**: YES
  - Message: `fix(server): link all assets at Campaign level instead of AdGroup

All assets now use campaignAssets:mutate instead of adGroupAssets:mutate.
This makes them appear as linked in Google Ads UI like Lead Form does.

Changed: Sitelinks, Callouts, Promotions, Prices, Calls, Mobile App`
  - Files: server.js
