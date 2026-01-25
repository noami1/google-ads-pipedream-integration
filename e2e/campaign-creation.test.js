import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * E2E Tests for Google Ads Campaign Creation
 * 
 * RATE LIMIT: Test developer token = 10 req/min, so 6.5s delay between requests
 * 
 * BATCH JOBS: Uses createCompleteCampaign endpoint with GAQL-based polling
 * to create complete campaigns (budget, campaign, ad group, keywords, ads) in a single request.
 */

const BASE_URL = 'http://localhost:3000';
const TEST_CONFIG = {
  externalUserId: 'test-user-1',
  accountId: 'apn_GXhxB59',
  customerId: '6388991727',
};

const RATE_LIMIT_DELAY_MS = 6500;
let lastRequestTime = 0;

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS && lastRequestTime > 0) {
    const waitTime = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms before next request...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  return fetch(url, options);
}

let createdCampaignName = null;
let createdCampaignId = null;
let createdAdGroupId = null;

function generateUniqueCampaignName() {
  return `E2E Test Campaign ${Date.now()}`;
}

describe('Google Ads Campaign Creation E2E', () => {
  beforeAll(async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/accounts?externalUserId=${TEST_CONFIG.externalUserId}`);
      if (!response.ok) {
        throw new Error(`Server not responding properly: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Server must be running at ${BASE_URL}. Start with: npm start\nError: ${error.message}`);
    }
  }, 30000);

  afterAll(async () => {
    if (createdCampaignId) {
      console.log(`\nCleaning up: Removing campaign ${createdCampaignName} (ID: ${createdCampaignId})`);
      
      try {
        const response = await rateLimitedFetch(
          `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/campaigns/mutate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              externalUserId: TEST_CONFIG.externalUserId,
              accountId: TEST_CONFIG.accountId,
              operations: [{
                remove: `customers/${TEST_CONFIG.customerId}/campaigns/${createdCampaignId}`
              }]
            })
          }
        );
        
        if (response.ok) {
          console.log('Campaign removed successfully');
        } else {
          const errorText = await response.text();
          console.error('Failed to remove campaign:', errorText);
        }
      } catch (error) {
        console.error('Cleanup error:', error.message);
      }
    }
  }, 120000);

   it('should create a complete campaign via batch job endpoint', async () => {
     createdCampaignName = generateUniqueCampaignName();
     
     const campaignData = {
       externalUserId: TEST_CONFIG.externalUserId,
       accountId: TEST_CONFIG.accountId,
       campaignName: createdCampaignName,
       budgetAmountMicros: 100000,
       status: 'PAUSED',
       adGroupName: `${createdCampaignName} - Ad Group`,
       maxCpcUsd: 0.50,
       keywords: [
         { text: 'test keyword one', matchType: 'BROAD' },
         { text: 'test keyword two', matchType: 'PHRASE' },
         { text: 'test keyword three', matchType: 'EXACT' },
       ],
       finalUrl: 'https://example.com/landing-page',
       displayPath1: 'test',
       displayPath2: 'path',
       adHeadlines: ['Test Headline One', 'Test Headline Two', 'Test Headline Three'],
       adDescriptions: [
         'This is test description number one for the responsive search ad.',
         'This is test description number two with more details about our offer.',
       ],
       callouts: ['Free Shipping', '24/7 Support', 'Money Back Guarantee'],
     };

     console.log(`\nCreating complete campaign via batch job: ${createdCampaignName}`);

     // GIVEN: Create complete campaign via batch job
     console.log('\n1. Calling createCompleteCampaign endpoint...');
     const createResponse = await rateLimitedFetch(
       `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/createCompleteCampaign`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(campaignData),
       }
     );

     expect(createResponse.ok).toBe(true);
     const createResult = await createResponse.json();
     console.log('Batch job response:', JSON.stringify(createResult, null, 2));

     // THEN: Batch job completed successfully
     expect(createResult.success).toBe(true);
     expect(createResult.status).toBe('DONE');
     expect(createResult.campaign).toBeTruthy();
     expect(createResult.campaign.name).toBe(createdCampaignName);
     
     createdCampaignId = createResult.campaign.id;
     createdAdGroupId = createResult.adGroup?.id;

     // WHEN: Verify ad group was created
     console.log('\n2. Verifying ad group...');
     const adGroupVerifyResponse = await rateLimitedFetch(
       `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/googleAds:search?externalUserId=${TEST_CONFIG.externalUserId}&accountId=${TEST_CONFIG.accountId}`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           query: `
             SELECT 
               ad_group.id,
               ad_group.name,
               ad_group.status,
               ad_group.type
             FROM ad_group 
             WHERE ad_group.id = ${createdAdGroupId}
           `
         })
       }
     );

     // THEN: Ad group has correct fields
     expect(adGroupVerifyResponse.ok).toBe(true);
     const adGroupVerifyResult = await adGroupVerifyResponse.json();
     console.log('Ad group verification:', JSON.stringify(adGroupVerifyResult, null, 2));
     
     expect(adGroupVerifyResult.results?.length).toBe(1);
     const adGroup = adGroupVerifyResult.results[0].adGroup;
     expect(adGroup.name).toBe(`${createdCampaignName} - Ad Group`);
     expect(adGroup.status).toBe('ENABLED');
     expect(adGroup.type).toBe('SEARCH_STANDARD');

     // WHEN: Verify keywords were created
     console.log('\n3. Verifying keywords...');
     const keywordsVerifyResponse = await rateLimitedFetch(
       `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/googleAds:search?externalUserId=${TEST_CONFIG.externalUserId}&accountId=${TEST_CONFIG.accountId}`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           query: `
             SELECT 
               ad_group_criterion.keyword.text,
               ad_group_criterion.keyword.match_type,
               ad_group_criterion.status
             FROM ad_group_criterion 
             WHERE ad_group.id = ${createdAdGroupId}
               AND ad_group_criterion.type = 'KEYWORD'
           `
         })
       }
     );

     // THEN: All 3 keywords exist
     expect(keywordsVerifyResponse.ok).toBe(true);
     const keywordsVerifyResult = await keywordsVerifyResponse.json();
     console.log('Keywords verification:', JSON.stringify(keywordsVerifyResult, null, 2));
     
     expect(keywordsVerifyResult.results?.length).toBe(3);
     const keywordTexts = keywordsVerifyResult.results.map(r => r.adGroupCriterion.keyword.text);
     expect(keywordTexts).toContain('test keyword one');
     expect(keywordTexts).toContain('test keyword two');
     expect(keywordTexts).toContain('test keyword three');

     // WHEN: Verify ad was created
     console.log('\n4. Verifying responsive search ad...');
     const adVerifyResponse = await rateLimitedFetch(
       `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/googleAds:search?externalUserId=${TEST_CONFIG.externalUserId}&accountId=${TEST_CONFIG.accountId}`,
       {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           query: `
             SELECT 
               ad_group_ad.ad.id,
               ad_group_ad.ad.type,
               ad_group_ad.ad.final_urls,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions,
               ad_group_ad.status
             FROM ad_group_ad 
             WHERE ad_group.id = ${createdAdGroupId}
           `
         })
       }
     );

     // THEN: Ad exists with headlines and descriptions
     expect(adVerifyResponse.ok).toBe(true);
     const adVerifyResult = await adVerifyResponse.json();
     console.log('Ad verification:', JSON.stringify(adVerifyResult, null, 2));
     
     expect(adVerifyResult.results?.length).toBeGreaterThan(0);
     const ad = adVerifyResult.results[0].adGroupAd.ad;
     expect(ad.type).toBe('RESPONSIVE_SEARCH_AD');
     expect(ad.finalUrls).toContain('https://example.com/landing-page');
     expect(ad.responsiveSearchAd.headlines.length).toBe(3);
     expect(ad.responsiveSearchAd.descriptions.length).toBe(2);

     console.log('\n All verifications passed! Campaign created successfully via batch job.');
     
   }, 300000);
});
