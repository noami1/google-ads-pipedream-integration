# Replace Batch Jobs with Sequential API Calls in createCompleteCampaign

## Context

### Original Request
Replace batch job implementation in `createCompleteCampaign` endpoint with sequential API calls, since batch jobs don't work reliably with test developer tokens.

### Problem
- Batch jobs with test developer tokens only create campaign + budget
- Ad group, keywords, ads, and assets are not created
- Sequential API calls work reliably (proven by e2e tests)

### Current State
- Branch: `sequential-api-calls` (created from master)
- `server.js` lines 648-1078: Uses batch jobs
- E2e tests use sequential calls and pass

---

## Work Objectives

### Core Objective
Rewrite `createCompleteCampaign` endpoint to use sequential API calls instead of batch jobs.

### Concrete Deliverables
- Modified `server.js` with sequential API implementation

### Definition of Done
- [ ] Endpoint uses sequential API calls (not batch jobs)
- [ ] Creates: budget, campaign, ad group, keywords, ad, assets
- [ ] Returns created campaign info
- [ ] E2e tests pass

---

## TODOs

- [ ] 1. Rewrite createCompleteCampaign to use sequential API calls

  **What to do**:
  Replace lines 648-1078 in server.js. Instead of batch jobs, use sequential calls:
  
  1. Create budget via `/customers/{id}/campaignBudgets:mutate`
  2. Create campaign via `/customers/{id}/campaigns:mutate` (reference budget)
  3. Create ad group via `/customers/{id}/adGroups:mutate` (reference campaign)
  4. Create keywords via `/customers/{id}/adGroupCriteria:mutate` (reference ad group)
  5. Create ad via `/customers/{id}/adGroupAds:mutate` (reference ad group)
  6. Create assets via `/customers/{id}/assets:mutate`
  7. Link assets via `/customers/{id}/adGroupAssets:mutate`
  
  Each call uses actual resource names from previous responses (not temp IDs).
  
  Return: `{ success: true, campaign: {...}, adGroup: {...}, ... }`

  **References**:
  - `server.js:648-1078` - Current batch job implementation
  - `e2e/campaign-creation.test.js` - Working sequential call examples

  **Acceptance Criteria**:
  - [ ] No batch job code remains
  - [ ] Sequential calls create all resources
  - [ ] E2e tests pass

  **Commit**: YES
  - Message: `fix(server): use sequential API calls instead of batch jobs in createCompleteCampaign`
  - Files: `server.js`
