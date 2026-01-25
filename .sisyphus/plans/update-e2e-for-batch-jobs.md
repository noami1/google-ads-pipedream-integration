# Update E2E Tests to Use Batch Job Endpoint

## Context

### Original Request
Update the e2e tests to use the `createCompleteCampaign` batch job endpoint instead of sequential API calls, now that the batch job polling has been fixed.

### Current State
- `e2e/campaign-creation.test.js` uses sequential API calls (9+ requests per test)
- Batch job endpoint now works with GAQL-based polling
- Tests should use batch jobs to save rate limit quota (1 request vs 9+)

---

## Work Objectives

### Core Objective
Rewrite e2e tests to use the batch job endpoint and verify it creates all campaign components.

### Concrete Deliverables
- Updated `e2e/campaign-creation.test.js` with batch job test

### Definition of Done
- [ ] Test uses `createCompleteCampaign` endpoint
- [ ] Test verifies batch job completes successfully
- [ ] Test verifies all components created (campaign, ad group, keywords, ad)
- [ ] Test passes when run

### Must Have
- Single batch job request instead of sequential calls
- Verification of batch job success
- Verification of created resources

### Must NOT Have
- Sequential API calls for campaign creation
- Fallback to sequential if batch fails (fix batch instead)

---

## TODOs

- [ ] 1. Update test file docstring

  **What to do**:
  Change line 8-10 from:
  ```
  NOTE: The createCompleteCampaign endpoint uses batch jobs which can be unreliable
  with test developer tokens. This test uses createSimpleCampaign for basic validation
  and then manually creates ad groups/keywords via sequential API calls.
  ```
  
  To:
  ```
  BATCH JOBS: Uses createCompleteCampaign endpoint with GAQL-based polling
  ```

  **Parallelizable**: NO (single file)

  **References**:
  - `e2e/campaign-creation.test.js:8-10`

  **Acceptance Criteria**:
  - [ ] Docstring mentions batch jobs with GAQL polling

  **Commit**: NO (group with task 2)

- [ ] 2. Replace first test with batch job test

  **What to do**:
  Replace the test `should create a full campaign with budget, ad group, keywords, and ad via sequential API calls` (lines 90-416) with a batch job test that:
  
  1. Calls `createCompleteCampaign` endpoint with campaign data
  2. Verifies response has `success: true`, `status: DONE`, and `campaign` object
  3. Extracts `createdCampaignId` from response
  4. Queries for ad group, keywords, and ad to verify they were created
  
  Keep the same campaign data structure, just send it to the batch endpoint instead of making sequential calls.

  **Parallelizable**: NO (depends on task 1)

  **References**:
  - `e2e/campaign-creation.test.js:90-416` - Current sequential test
  - `server.js:1028-1068` - Batch job endpoint response format

  **Acceptance Criteria**:
  - [ ] Test calls `createCompleteCampaign` endpoint
  - [ ] Test expects `success: true` and `status: DONE`
  - [ ] Test verifies ad group, keywords, and ad were created

  **Commit**: NO (group with task 3)

- [ ] 3. Remove second test and unused variables

  **What to do**:
  - Remove the second test `should create campaign with callout and call extensions` (lines 418-599)
  - Remove `createdBudgetId` variable (line 40) since batch job handles budget internally
  
  Keep only one test that focuses on batch job functionality.

  **Parallelizable**: NO (depends on task 2)

  **References**:
  - `e2e/campaign-creation.test.js:418-599` - Second test to remove
  - `e2e/campaign-creation.test.js:40` - Unused variable

  **Acceptance Criteria**:
  - [ ] Only one test remains
  - [ ] No unused variables

  **Commit**: YES
  - Message: `test(e2e): update tests to use batch job endpoint`
  - Files: `e2e/campaign-creation.test.js`
  - Pre-commit: Run `npm test` to verify tests pass

---

## Success Criteria

### Verification Commands
```bash
# Run the updated e2e tests
npm test

# Expected: Test passes, batch job creates campaign with all components
```

### Final Checklist
- [ ] Test uses batch job endpoint (1 request instead of 9+)
- [ ] Test verifies batch job success
- [ ] Test verifies all resources created
- [ ] Tests pass
