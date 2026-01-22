# Enhanced Campaign Creation - Implementation Plan

## Overview

Enhance the campaign creation form to support full Google Ads campaign setup including all optional asset extensions.

---

## 1. URL Normalization

**Input:** `https://example.com/products/shoes`

**Output:**
- `finalUrl`: `https://example.com`
- `path1`: `products`
- `path2`: `shoes`

**Rules:**
- Extract origin (protocol + domain) as `finalUrl`
- First path segment → `path1` (max 15 chars)
- Second path segment → `path2` (max 15 chars)
- If more than 2 segments, ignore the rest
- Display paths are part of the Responsive Search Ad, not separate fields

---

## 2. Form Sections

### Section 1: Campaign & Budget (REQUIRED)

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| Campaign Name | Yes | - | Unique name |
| Daily Budget (USD) | Yes | 0.10 | Converted to micros |
| Status | Yes | PAUSED | PAUSED or ENABLED |

### Section 2: Ad Group & Keywords (REQUIRED)

| Field | Required | Min | Max | Notes |
|-------|----------|-----|-----|-------|
| Ad Group Name | Yes | - | - | |
| Keywords | Yes | 1 | - | Comma-separated, each gets BROAD match by default |

### Section 3: Headlines & Descriptions (REQUIRED)

| Field | Required | Min | Max | Max Chars |
|-------|----------|-----|-----|-----------|
| Headlines | Yes | 2 | 15 | 30 each |
| Descriptions | Yes | 2 | 4 | 90 each |

**UI Behavior:**
- Show 3 headline fields by default
- Show 2 description fields by default
- "Add Headline" button (up to 15)
- "Add Description" button (up to 4)
- Character counter on each field

### Section 4: Final URL (REQUIRED)

| Field | Required | Max Chars | Notes |
|-------|----------|-----------|-------|
| Final URL | Yes | - | Full URL with path |
| Display Path 1 | Auto | 15 | Auto-extracted from URL, editable |
| Display Path 2 | Auto | 15 | Auto-extracted from URL, editable |

**UI Behavior:**
- When user enters URL, auto-extract and populate path fields
- User can edit the extracted paths
- Show character counter (15 max)

---

## DIVIDER: Optional Extensions

*All sections below are completely optional. If no data is provided, that asset type is not created.*

---

### Section 5: Promotions (OPTIONAL)

| Field | Required* | Max Chars | Notes |
|-------|-----------|-----------|-------|
| Promotion Target | Yes* | 20 | What's being promoted (e.g., "Summer Sale") |
| Discount Type | Yes* | - | Radio: "Money Off" or "Percent Off" |
| Money Amount Off | If selected | - | Amount + Currency (e.g., 10, USD) |
| Percent Off | If selected | - | Number (e.g., 20 for 20%) |
| Occasion | No | - | Dropdown: NONE, NEW_YEARS, VALENTINES_DAY, EASTER, MOTHERS_DAY, FATHERS_DAY, LABOR_DAY, BACK_TO_SCHOOL, HALLOWEEN, BLACK_FRIDAY, CYBER_MONDAY, CHRISTMAS, BOXING_DAY, INDEPENDENCE_DAY, NATIONAL_DAY, END_OF_SEASON, WINTER_SALE, SUMMER_SALE, FALL_SALE, SPRING_SALE, RAMADAN, EID_AL_FITR, EID_AL_ADHA, SINGLES_DAY, WOMENS_DAY, HOLI, PARENTS_DAY, ST_NICHOLAS_DAY, CARNIVAL, EPIPHANY, ROSH_HASHANAH, PASSOVER, HANUKKAH, DIWALI, NAVRATRI, SONGKRAN, YEAR_END_GIFT |
| Promotion Code | No | - | e.g., "SAVE20" |
| Orders Over Amount | No | - | Minimum order (amount + currency) |
| Start Date | No | - | yyyy-MM-dd |
| End Date | No | - | yyyy-MM-dd |

*Required only if Promotions section is used

### Section 6: Prices (OPTIONAL)

| Field | Required* | Notes |
|-------|-----------|-------|
| Price Type | Yes* | Dropdown: BRANDS, EVENTS, LOCATIONS, NEIGHBORHOODS, PRODUCT_CATEGORIES, PRODUCT_TIERS, SERVICES, SERVICE_CATEGORIES, SERVICE_TIERS |
| Price Qualifier | No | Dropdown: NONE, FROM, UP_TO, AVERAGE |
| Language Code | Yes* | Default: "en" |
| Price Offerings | Yes* | Min: 1, Max: 8 (Google requires 3-8, but we send only filled ones) |

**Each Price Offering:**

| Field | Required | Max Chars |
|-------|----------|-----------|
| Header | Yes | 25 |
| Description | Yes | 25 |
| Price (Amount) | Yes | - |
| Price (Currency) | Yes | - | Default: USD |
| Final URL | Yes | - |
| Unit | No | Dropdown: NONE, PER_HOUR, PER_DAY, PER_WEEK, PER_MONTH, PER_YEAR, PER_NIGHT |

**UI Behavior:**
- Show 1 empty offering by default
- "Add Price Offering" button (up to 8)
- **Note:** Google API requires 3-8 offerings. If user provides 1-2, we either:
  - Show validation error requiring at least 3
  - Or skip price asset entirely if < 3

### Section 7: Calls (OPTIONAL)

| Field | Required* | Notes |
|-------|-----------|-------|
| Country Code | Yes* | Default: "US" (2-letter code) |
| Phone Number | Yes* | e.g., "+1234567890" |

*Required only if Calls section is used

### Section 8: Callouts (OPTIONAL)

| Field | Required* | Max Chars |
|-------|-----------|-----------|
| Callout Text | Yes* | 25 |

**UI Behavior:**
- Show 1 empty callout field by default
- "Add Callout" button (can add multiple)
- Each callout is a separate asset

*Required only if Callouts section is used

### Section 9: Lead Forms (OPTIONAL)

| Field | Required* | Max Chars | Notes |
|-------|-----------|-----------|-------|
| Business Name | Yes* | 25 | |
| Headline | Yes* | 30 | |
| Description | Yes* | 200 | |
| Privacy Policy URL | Yes* | - | Must be valid URL |
| Call to Action Type | Yes* | - | Dropdown: LEARN_MORE, GET_QUOTE, APPLY_NOW, SIGN_UP, CONTACT_US, SUBSCRIBE, DOWNLOAD, BOOK_NOW, GET_OFFER, REGISTER, GET_INFO, REQUEST_DEMO, JOIN_NOW, GET_STARTED |
| Call to Action Description | Yes* | 30 | |
| Post-Submit Headline | No | 30 | Thank you message |
| Post-Submit Description | No | 200 | |

**Form Fields to Collect (Checkboxes):**
- [ ] Full Name
- [ ] Email
- [ ] Phone Number
- [ ] Postal Code
- [ ] City
- [ ] Country
- [ ] Company Name
- [ ] Job Title

Only checked fields are included in the API request.

*Required only if Lead Forms section is used

### Section 10: Apps (OPTIONAL)

| Field | Required* | Max Chars | Notes |
|-------|-----------|-----------|-------|
| App Store | Yes* | - | Radio: Apple App Store, Google Play Store |
| App ID | Yes* | - | Native app ID from store |
| Link Text | Yes* | 25 | e.g., "Download Now" |

*Required only if Apps section is used

---

## 3. Backend Implementation

### 3.1 Enhanced `createCompleteCampaign` Endpoint

**New Request Body Structure:**

```javascript
{
  // Required - existing fields
  externalUserId: string,
  accountId: string,
  campaignName: string,
  budgetAmountMicros: number,
  status: "PAUSED" | "ENABLED",
  adGroupName: string,
  keywords: string[],
  adHeadlines: string[],        // 2-15 items, max 30 chars each
  adDescriptions: string[],     // 2-4 items, max 90 chars each
  finalUrl: string,             // Full URL, will be normalized
  
  // Optional - new fields
  displayPath1?: string,        // Max 15 chars (auto-extracted or manual)
  displayPath2?: string,        // Max 15 chars (auto-extracted or manual)
  
  // Optional Extensions
  promotion?: {
    promotionTarget: string,    // Required if promotion provided
    moneyAmountOff?: { amount: number, currencyCode: string },
    percentOff?: number,
    occasion?: string,
    promotionCode?: string,
    ordersOverAmount?: { amount: number, currencyCode: string },
    startDate?: string,
    endDate?: string
  },
  
  prices?: {
    type: string,               // Required if prices provided
    priceQualifier?: string,
    languageCode: string,       // Default: "en"
    offerings: [{
      header: string,           // Max 25 chars
      description: string,      // Max 25 chars
      price: { amount: number, currencyCode: string },
      finalUrl: string,
      unit?: string
    }]                          // 3-8 items required by Google
  },
  
  call?: {
    countryCode: string,        // Default: "US"
    phoneNumber: string
  },
  
  callouts?: string[],          // Array of callout texts, max 25 chars each
  
  leadForm?: {
    businessName: string,       // Max 25 chars
    headline: string,           // Max 30 chars
    description: string,        // Max 200 chars
    privacyPolicyUrl: string,
    callToActionType: string,
    callToActionDescription: string,  // Max 30 chars
    postSubmitHeadline?: string,      // Max 30 chars
    postSubmitDescription?: string,   // Max 200 chars
    fields: string[]            // Array of field types to collect
  },
  
  app?: {
    appStore: "APPLE_APP_STORE" | "GOOGLE_APP_STORE",
    appId: string,
    linkText: string            // Max 25 chars
  }
}
```

### 3.2 URL Normalization Logic

```javascript
function normalizeUrl(fullUrl) {
  const url = new URL(fullUrl);
  const pathSegments = url.pathname.split('/').filter(s => s.length > 0);
  
  return {
    finalUrl: url.origin,
    path1: (pathSegments[0] || '').substring(0, 15),
    path2: (pathSegments[1] || '').substring(0, 15)
  };
}
```

### 3.3 Batch Job Operations Order

1. **CampaignBudget** (temp ID: -1)
2. **Campaign** (temp ID: -2, references -1)
3. **AdGroup** (temp ID: -3, references -2)
4. **AdGroupCriterion** - Keywords (references -3)
5. **AdGroupAd** - Responsive Search Ad (references -3)
6. **Asset** - Promotion (temp ID: -10, if provided)
7. **Asset** - Price (temp ID: -11, if provided)
8. **Asset** - Call (temp ID: -12, if provided)
9. **Asset** - Callout(s) (temp IDs: -13, -14, ..., if provided)
10. **Asset** - Lead Form (temp ID: -20, if provided)
11. **Asset** - Mobile App (temp ID: -21, if provided)
12. **AdGroupAsset** - Link each asset to the ad group (references -3 and asset temp IDs)

---

## 4. Frontend Implementation

### 4.1 Form Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Step 5: Create Complete Campaign                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ CAMPAIGN & BUDGET                                    [REQ]  │
│ ═══════════════════════════════════════════════════════════│
│ Campaign Name: [________________________]                   │
│ Daily Budget:  [$] [0.10]                                  │
│ Status:        [PAUSED ▼]                                  │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ AD GROUP & KEYWORDS                                  [REQ]  │
│ ═══════════════════════════════════════════════════════════│
│ Ad Group Name: [________________________]                   │
│ Keywords:      [____________________________]               │
│                (comma-separated)                            │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ HEADLINES & DESCRIPTIONS                             [REQ]  │
│ ═══════════════════════════════════════════════════════════│
│ Headlines (min 2, max 15):                                 │
│ Headline 1: [________________________] 0/30                │
│ Headline 2: [________________________] 0/30                │
│ Headline 3: [________________________] 0/30                │
│ [+ Add Headline]                                           │
│                                                             │
│ Descriptions (min 2, max 4):                               │
│ Description 1: [________________________] 0/90             │
│ Description 2: [________________________] 0/90             │
│ [+ Add Description]                                        │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ FINAL URL & DISPLAY PATH                             [REQ]  │
│ ═══════════════════════════════════════════════════════════│
│ Final URL: [https://example.com/products/shoes___]         │
│ Display:   example.com / [products__] / [shoes_____]       │
│                           (auto-filled, editable)          │
│                                                             │
│ ───────────────────────────────────────────────────────────│
│                   OPTIONAL EXTENSIONS                       │
│ ───────────────────────────────────────────────────────────│
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ PROMOTIONS                                           [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ Promotion Target: [Summer Sale___________] 0/20            │
│ Discount Type:    ○ Money Off  ○ Percent Off               │
│   Amount: [$] [10] [USD ▼]  OR  Percent: [20] %           │
│ Occasion: [BLACK_FRIDAY ▼]                                 │
│ Promo Code: [SAVE20_____]                                  │
│ Orders Over: [$] [50] [USD ▼]                              │
│ Start Date: [____-__-__]  End Date: [____-__-__]          │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ PRICES                                               [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ Type: [SERVICES ▼]  Qualifier: [FROM ▼]  Lang: [en]       │
│                                                             │
│ Offering 1:                                                │
│   Header: [Basic Plan______] 0/25                          │
│   Description: [Great for starters] 0/25                   │
│   Price: [$] [9.99] [USD ▼]  Unit: [PER_MONTH ▼]          │
│   URL: [https://example.com/basic]                         │
│ [+ Add Price Offering]                                     │
│ (Note: Google requires 3-8 offerings if prices are used)   │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ CALLS                                                [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ Country: [US ▼]  Phone: [+1-555-123-4567]                  │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ CALLOUTS                                             [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ Callout 1: [Free Shipping________] 0/25                    │
│ [+ Add Callout]                                            │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ LEAD FORM                                            [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ Business Name: [Acme Corp_______] 0/25                     │
│ Headline: [Get a Free Quote____] 0/30                      │
│ Description: [Fill out the form...] 0/200                  │
│ Privacy Policy URL: [https://...]                          │
│ CTA Type: [GET_QUOTE ▼]                                    │
│ CTA Description: [Request your quote] 0/30                 │
│                                                             │
│ Post-Submit Headline: [Thank you!___] 0/30                 │
│ Post-Submit Description: [We'll contact...] 0/200          │
│                                                             │
│ Fields to Collect:                                         │
│ ☑ Full Name  ☑ Email  ☑ Phone  ☐ Postal Code              │
│ ☐ City  ☐ Country  ☐ Company Name  ☐ Job Title            │
│                                                             │
│ ═══════════════════════════════════════════════════════════│
│ MOBILE APP                                           [OPT]  │
│ ═══════════════════════════════════════════════════════════│
│ App Store: ○ Apple App Store  ○ Google Play Store          │
│ App ID: [com.example.app_____]                             │
│ Link Text: [Download Now____] 0/25                         │
│                                                             │
│ ───────────────────────────────────────────────────────────│
│                                                             │
│              [Create Complete Campaign]                     │
│                                                             │
│ Status: [_______________________________________]           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 JavaScript Functions to Add

1. `normalizeUrlOnInput()` - Auto-extract paths when URL changes
2. `addHeadlineField()` / `removeHeadlineField()` - Dynamic headline management
3. `addDescriptionField()` / `removeDescriptionField()` - Dynamic description management
4. `addPriceOffering()` / `removePriceOffering()` - Dynamic price offerings
5. `addCallout()` / `removeCallout()` - Dynamic callouts
6. `validateForm()` - Comprehensive validation before submit
7. `buildRequestBody()` - Construct the full request object
8. `createCompleteCampaignAdvanced()` - Submit handler

---

## 5. Delegation Strategy

### Agent 1: Backend Enhancement
**File:** `server.js`
**Tasks:**
- Add URL normalization function
- Enhance `createCompleteCampaign` endpoint to accept all new fields
- Add batch operations for all asset types
- Add asset linking (AdGroupAsset operations)
- Add validation for field lengths and required fields

### Agent 2: Frontend - Required Sections
**File:** `public/index.html`
**Tasks:**
- Redesign form with section dividers
- Campaign & Budget section
- Ad Group & Keywords section
- Headlines & Descriptions section (with dynamic add/remove)
- Final URL section (with auto-extraction)
- Character counters on all fields
- Basic form validation

### Agent 3: Frontend - Optional Sections
**File:** `public/index.html`
**Tasks:**
- Promotions section (all fields)
- Prices section (with dynamic offerings)
- Calls section
- Callouts section (with dynamic add)
- Lead Forms section (with field checkboxes)
- Apps section
- Integration with submit handler

---

## 6. Validation Rules

### Required Fields
- Campaign Name: non-empty
- Budget: > 0
- Ad Group Name: non-empty
- Keywords: at least 1
- Headlines: at least 2, each ≤ 30 chars
- Descriptions: at least 2, each ≤ 90 chars
- Final URL: valid URL format

### Optional Section Validation
If a section has ANY data, then its required fields must be filled:

**Promotions:** If promotionTarget filled → need discount type selected
**Prices:** If type selected → need at least 3 offerings (Google requirement)
**Calls:** If countryCode filled → need phoneNumber
**Callouts:** Each callout ≤ 25 chars
**Lead Forms:** If businessName filled → need all required fields
**Apps:** If appStore selected → need appId and linkText

---

## 7. API Response

**Success:**
```json
{
  "success": true,
  "batchJob": "customers/123/batchJobs/456",
  "resources": {
    "budget": "customers/123/campaignBudgets/789",
    "campaign": "customers/123/campaigns/101",
    "adGroup": "customers/123/adGroups/102",
    "keywords": ["customers/123/adGroupCriteria/103", ...],
    "ad": "customers/123/adGroupAds/104",
    "assets": {
      "promotion": "customers/123/assets/200",
      "price": "customers/123/assets/201",
      "call": "customers/123/assets/202",
      "callouts": ["customers/123/assets/203", ...],
      "leadForm": "customers/123/assets/204",
      "app": "customers/123/assets/205"
    }
  }
}
```

---

## 8. Notes & Caveats

1. **Prices Minimum:** Google requires 3-8 price offerings. If user provides < 3, show validation error.

2. **Asset Linking:** All optional assets are linked at the AdGroup level, not Campaign level.

3. **Batch Job Polling:** Current implementation has 404 issue with polling. Job completes but we can't get results. Consider adding retry logic or accepting that results may be null.

4. **Character Limits:** All limits are enforced both in frontend (maxlength) and validated in backend.

5. **Currency:** Default to USD, but allow selection for money fields.
