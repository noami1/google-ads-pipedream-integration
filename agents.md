# Google Ads API - Campaign Creation Reference (v21)

Quick reference for agents working with Google Ads campaign creation via REST API.

---

## Campaign Creation Flow

1. **Create CampaignBudget** → returns `resourceName`
2. **Create Campaign** → references budget's `resourceName`

---

## CampaignBudget

**Endpoint**: `POST /customers/{customerId}/campaignBudgets:mutate`

```json
{
  "operations": [{
    "create": {
      "name": "My Budget",
      "amountMicros": "100000",
      "deliveryMethod": "STANDARD"
    }
  }]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique budget name |
| `amountMicros` | string (int64) | Yes | Budget in micros. **$1 = 1,000,000 micros** |
| `deliveryMethod` | enum | No | `STANDARD` (default), `ACCELERATED` |
| `period` | enum | No | `DAILY` (default), `CUSTOM_PERIOD` |
| `type` | enum | No | `STANDARD`, `FIXED_CPA`, `SMART_CAMPAIGN` |
| `explicitlyShared` | boolean | No | If true, budget can be shared across campaigns |

### Budget Conversion Table

| USD | Micros |
|-----|--------|
| $0.01 | 10,000 |
| $0.10 | 100,000 |
| $1.00 | 1,000,000 |
| $10.00 | 10,000,000 |
| $100.00 | 100,000,000 |

---

## Campaign

**Endpoint**: `POST /customers/{customerId}/campaigns:mutate`

```json
{
  "operations": [{
    "create": {
      "name": "My Campaign",
      "campaignBudget": "customers/123/campaignBudgets/456",
      "advertisingChannelType": "SEARCH",
      "status": "PAUSED",
      "manualCpc": {},
      "networkSettings": {
        "targetGoogleSearch": true,
        "targetSearchNetwork": true,
        "targetContentNetwork": false,
        "targetPartnerSearchNetwork": false
      },
      "containsEuPoliticalAdvertising": "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
    }
  }]
}
```

### Core Fields

| Field | Type | Required | Mutable | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | Yes | Campaign name (unique per customer) |
| `campaignBudget` | string | Yes | Yes | Resource name of CampaignBudget |
| `advertisingChannelType` | enum | Yes | **No** | Channel type (immutable after creation) |
| `status` | enum | No | Yes | `ENABLED`, `PAUSED`, `REMOVED` |
| `containsEuPoliticalAdvertising` | enum | No | Yes | EU compliance field |

### advertisingChannelType (Immutable)

| Value | Description |
|-------|-------------|
| `SEARCH` | Google Search Network |
| `DISPLAY` | Google Display Network |
| `SHOPPING` | Shopping campaigns |
| `VIDEO` | YouTube/Video campaigns |
| `MULTI_CHANNEL` | Multi-channel |
| `LOCAL` | Local campaigns |
| `SMART` | Smart campaigns |
| `PERFORMANCE_MAX` | Performance Max campaigns |
| `LOCAL_SERVICES` | Local Services ads |
| `DISCOVERY` | Discovery campaigns |
| `TRAVEL` | Travel campaigns |
| `DEMAND_GEN` | Demand Gen campaigns |

### status

| Value | Description |
|-------|-------------|
| `ENABLED` | Campaign is active and serving |
| `PAUSED` | Campaign is paused (not serving) |
| `REMOVED` | Campaign is deleted |

### containsEuPoliticalAdvertising

| Value | Description |
|-------|-------------|
| `DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING` | Default - no EU political ads |
| `CONTAINS_EU_POLITICAL_ADVERTISING` | Contains EU political advertising |

---

## Bidding Strategies

Choose **ONE** bidding strategy. Set as empty object `{}` or with parameters.

### Manual Bidding

| Field | Description |
|-------|-------------|
| `manualCpc` | Manual cost-per-click |
| `manualCpm` | Manual cost-per-thousand impressions |
| `manualCpv` | Manual cost-per-view |
| `manualCpa` | Manual cost-per-acquisition |

```json
"manualCpc": {}
```

Or with enhanced CPC:
```json
"manualCpc": {
  "enhancedCpcEnabled": true
}
```

### Automated Bidding

| Field | Parameters | Description |
|-------|------------|-------------|
| `maximizeConversions` | `targetCpaMicros` (optional) | Maximize conversions within budget |
| `maximizeConversionValue` | `targetRoas` (optional) | Maximize conversion value |
| `targetCpa` | `targetCpaMicros` | Target cost-per-acquisition |
| `targetRoas` | `targetRoas` | Target return on ad spend |
| `targetSpend` | `cpcBidCeilingMicros` (optional) | Maximize clicks within budget |
| `targetImpressionShare` | `location`, `locationFractionMicros`, `cpcBidCeilingMicros` | Target impression share |

```json
"maximizeConversions": {
  "targetCpaMicros": "5000000"
}
```

```json
"targetRoas": {
  "targetRoas": 3.5
}
```

---

## Network Settings

```json
"networkSettings": {
  "targetGoogleSearch": true,
  "targetSearchNetwork": true,
  "targetContentNetwork": false,
  "targetPartnerSearchNetwork": false,
  "targetYoutube": false,
  "targetGoogleTvNetwork": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `targetGoogleSearch` | boolean | Google Search results |
| `targetSearchNetwork` | boolean | Search partner sites |
| `targetContentNetwork` | boolean | Display Network |
| `targetPartnerSearchNetwork` | boolean | Search partners |
| `targetYoutube` | boolean | YouTube (for eligible campaign types) |
| `targetGoogleTvNetwork` | boolean | Google TV Network |

---

## Complete Example: Create Paused Search Campaign with $0.10 Budget

### Step 1: Create Budget

```bash
curl -X POST "http://localhost:3000/api/customers/6388991727/campaignBudgets/mutate" \
  -H "Content-Type: application/json" \
  -d '{
    "externalUserId": "test-user-1",
    "accountId": "apn_vMh8JaE",
    "operations": [{
      "create": {
        "name": "Test Budget",
        "amountMicros": "100000",
        "deliveryMethod": "STANDARD"
      }
    }]
  }'
```

### Step 2: Create Campaign

```bash
curl -X POST "http://localhost:3000/api/customers/6388991727/campaigns/mutate" \
  -H "Content-Type: application/json" \
  -d '{
    "externalUserId": "test-user-1",
    "accountId": "apn_vMh8JaE",
    "operations": [{
      "create": {
        "name": "Test Campaign",
        "campaignBudget": "customers/6388991727/campaignBudgets/BUDGET_ID",
        "advertisingChannelType": "SEARCH",
        "status": "PAUSED",
        "manualCpc": {},
        "networkSettings": {
          "targetGoogleSearch": true,
          "targetSearchNetwork": true,
          "targetContentNetwork": false,
          "targetPartnerSearchNetwork": false
        },
        "containsEuPoliticalAdvertising": "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
      }
    }]
  }'
```

### Using the Simplified Endpoint

The server provides a simplified endpoint that creates both budget and campaign:

```bash
curl -X POST "http://localhost:3000/api/customers/6388991727/createSimpleCampaign" \
  -H "Content-Type: application/json" \
  -d '{
    "externalUserId": "test-user-1",
    "accountId": "apn_vMh8JaE",
    "campaignName": "My Test Campaign",
    "budgetAmountMicros": 100000,
    "status": "PAUSED"
  }'
```

---

## Error Handling

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `DUPLICATE_CAMPAIGN_NAME` | Campaign name already exists | Use unique name |
| `DUPLICATE_BUDGET_NAME` | Budget name already exists | Use unique name |
| `REQUIRED_FIELD_MISSING` | Missing required field | Check `containsEuPoliticalAdvertising` for EU accounts |
| `INVALID_ENUM_VALUE` | Wrong enum value | Check exact enum spelling (case-sensitive) |
| `BUDGET_AMOUNT_TOO_SMALL` | Budget below minimum | Increase `amountMicros` |

---

## Quick Reference: Minimum Viable Campaign

```json
{
  "name": "Campaign Name",
  "campaignBudget": "customers/{customerId}/campaignBudgets/{budgetId}",
  "advertisingChannelType": "SEARCH",
  "status": "PAUSED",
  "manualCpc": {},
  "containsEuPoliticalAdvertising": "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
}
```
