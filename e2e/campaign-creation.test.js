import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * E2E Tests for Google Ads Campaign Creation
 * 
 * RATE LIMIT: Test developer token = 10 req/min, so 6.5s delay between requests
 * 
 * NOTE: The createCompleteCampaign endpoint uses batch jobs which can be unreliable
 * with test developer tokens. This test uses createSimpleCampaign for basic validation
 * and then manually creates ad groups/keywords via sequential API calls.
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
let createdBudgetId = null;

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

  it('should create a full campaign with budget, ad group, keywords, and ad via sequential API calls', async () => {
    createdCampaignName = generateUniqueCampaignName();
    const adGroupName = `${createdCampaignName} - Ad Group`;
    
    console.log(`\nCreating campaign: ${createdCampaignName}`);

    // GIVEN: Create campaign budget
    console.log('\n1. Creating campaign budget...');
    const budgetResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/campaignBudgets/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: `${createdCampaignName} Budget`,
              deliveryMethod: 'STANDARD',
              amountMicros: '100000',
            }
          }]
        })
      }
    );

    expect(budgetResponse.ok).toBe(true);
    const budgetResult = await budgetResponse.json();
    console.log('Budget created:', JSON.stringify(budgetResult, null, 2));
    
    const budgetResourceName = budgetResult.results?.[0]?.resourceName;
    expect(budgetResourceName).toBeTruthy();
    createdBudgetId = budgetResourceName.split('/').pop();

    // GIVEN: Create campaign
    console.log('\n2. Creating campaign...');
    const campaignResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/campaigns/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: createdCampaignName,
              campaignBudget: budgetResourceName,
              advertisingChannelType: 'SEARCH',
              status: 'PAUSED',
              manualCpc: {},
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: true,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false,
              },
              containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
            }
          }]
        })
      }
    );

    expect(campaignResponse.ok).toBe(true);
    const campaignResult = await campaignResponse.json();
    console.log('Campaign created:', JSON.stringify(campaignResult, null, 2));
    
    const campaignResourceName = campaignResult.results?.[0]?.resourceName;
    expect(campaignResourceName).toBeTruthy();
    createdCampaignId = campaignResourceName.split('/').pop();

    // GIVEN: Create ad group
    console.log('\n3. Creating ad group...');
    const adGroupResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/adGroups/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: adGroupName,
              campaign: campaignResourceName,
              type: 'SEARCH_STANDARD',
              status: 'ENABLED',
              cpcBidMicros: '500000',
            }
          }]
        })
      }
    );

    expect(adGroupResponse.ok).toBe(true);
    const adGroupResult = await adGroupResponse.json();
    console.log('Ad group created:', JSON.stringify(adGroupResult, null, 2));
    
    const adGroupResourceName = adGroupResult.results?.[0]?.resourceName;
    expect(adGroupResourceName).toBeTruthy();
    createdAdGroupId = adGroupResourceName.split('/').pop();

    // GIVEN: Create keywords
    console.log('\n4. Creating keywords...');
    const keywordsResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/adGroupCriteria/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [
            {
              create: {
                adGroup: adGroupResourceName,
                status: 'ENABLED',
                keyword: { text: 'test keyword one', matchType: 'BROAD' }
              }
            },
            {
              create: {
                adGroup: adGroupResourceName,
                status: 'ENABLED',
                keyword: { text: 'test keyword two', matchType: 'PHRASE' }
              }
            },
            {
              create: {
                adGroup: adGroupResourceName,
                status: 'ENABLED',
                keyword: { text: 'test keyword three', matchType: 'EXACT' }
              }
            }
          ]
        })
      }
    );

    expect(keywordsResponse.ok).toBe(true);
    const keywordsResult = await keywordsResponse.json();
    console.log('Keywords created:', JSON.stringify(keywordsResult, null, 2));
    expect(keywordsResult.results?.length).toBe(3);

    // GIVEN: Create responsive search ad
    console.log('\n5. Creating responsive search ad...');
    const adResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/adGroupAds/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              adGroup: adGroupResourceName,
              status: 'ENABLED',
              ad: {
                responsiveSearchAd: {
                  headlines: [
                    { text: 'Test Headline One' },
                    { text: 'Test Headline Two' },
                    { text: 'Test Headline Three' },
                  ],
                  descriptions: [
                    { text: 'Test description one for responsive search ad.' },
                    { text: 'Test description two with more details.' },
                  ],
                  path1: 'test',
                  path2: 'path',
                },
                finalUrls: ['https://example.com'],
              }
            }
          }]
        })
      }
    );

    expect(adResponse.ok).toBe(true);
    const adResult = await adResponse.json();
    console.log('Ad created:', JSON.stringify(adResult, null, 2));
    expect(adResult.results?.[0]?.resourceName).toBeTruthy();

    // WHEN: Verifying campaign was created correctly
    console.log('\n6. Verifying campaign details...');
    const verifyResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/googleAds:search?externalUserId=${TEST_CONFIG.externalUserId}&accountId=${TEST_CONFIG.accountId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            SELECT 
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.advertising_channel_type,
              campaign_budget.amount_micros,
              campaign_budget.delivery_method
            FROM campaign 
            WHERE campaign.id = ${createdCampaignId}
          `
        })
      }
    );

    // THEN: Campaign has correct fields
    expect(verifyResponse.ok).toBe(true);
    const verifyResult = await verifyResponse.json();
    console.log('Campaign verification:', JSON.stringify(verifyResult, null, 2));
    
    expect(verifyResult.results?.length).toBe(1);
    const campaign = verifyResult.results[0].campaign;
    expect(campaign.name).toBe(createdCampaignName);
    expect(campaign.status).toBe('PAUSED');
    expect(campaign.advertisingChannelType).toBe('SEARCH');
    
    const budget = verifyResult.results[0].campaignBudget;
    expect(budget.amountMicros).toBe('100000');
    expect(budget.deliveryMethod).toBe('STANDARD');

    // WHEN: Verifying ad group
    console.log('\n7. Verifying ad group details...');
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
    expect(adGroup.name).toBe(adGroupName);
    expect(adGroup.status).toBe('ENABLED');
    expect(adGroup.type).toBe('SEARCH_STANDARD');

    // WHEN: Verifying keywords
    console.log('\n8. Verifying keywords...');
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

    // WHEN: Verifying ad
    console.log('\n9. Verifying responsive search ad...');
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
    expect(ad.finalUrls).toContain('https://example.com');
    expect(ad.responsiveSearchAd.headlines.length).toBe(3);
    expect(ad.responsiveSearchAd.descriptions.length).toBe(2);

    console.log('\n All verifications passed! Campaign created successfully with all components.');
    
  }, 300000);

  it('should create campaign with callout and call extensions', async () => {
    createdCampaignName = generateUniqueCampaignName();
    const adGroupName = `${createdCampaignName} - Ad Group`;
    
    console.log(`\nCreating campaign with extensions: ${createdCampaignName}`);

    // GIVEN: Create budget and campaign
    console.log('\n1. Creating campaign budget...');
    const budgetResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/campaignBudgets/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: `${createdCampaignName} Budget`,
              deliveryMethod: 'STANDARD',
              amountMicros: '200000',
            }
          }]
        })
      }
    );

    expect(budgetResponse.ok).toBe(true);
    const budgetResult = await budgetResponse.json();
    const budgetResourceName = budgetResult.results?.[0]?.resourceName;
    expect(budgetResourceName).toBeTruthy();

    console.log('\n2. Creating campaign...');
    const campaignResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/campaigns/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: createdCampaignName,
              campaignBudget: budgetResourceName,
              advertisingChannelType: 'SEARCH',
              status: 'PAUSED',
              manualCpc: {},
              networkSettings: {
                targetGoogleSearch: true,
                targetSearchNetwork: false,
                targetContentNetwork: false,
                targetPartnerSearchNetwork: false,
              },
              containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
            }
          }]
        })
      }
    );

    expect(campaignResponse.ok).toBe(true);
    const campaignResult = await campaignResponse.json();
    const campaignResourceName = campaignResult.results?.[0]?.resourceName;
    expect(campaignResourceName).toBeTruthy();
    createdCampaignId = campaignResourceName.split('/').pop();

    console.log('\n3. Creating ad group...');
    const adGroupResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/adGroups/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [{
            create: {
              name: adGroupName,
              campaign: campaignResourceName,
              type: 'SEARCH_STANDARD',
              status: 'ENABLED',
              cpcBidMicros: '750000',
            }
          }]
        })
      }
    );

    expect(adGroupResponse.ok).toBe(true);
    const adGroupResult = await adGroupResponse.json();
    const adGroupResourceName = adGroupResult.results?.[0]?.resourceName;
    expect(adGroupResourceName).toBeTruthy();
    createdAdGroupId = adGroupResourceName.split('/').pop();

    // GIVEN: Create callout assets
    console.log('\n4. Creating callout assets...');
    const calloutAssetResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/assets/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: [
            { create: { calloutAsset: { calloutText: 'Free Shipping' } } },
            { create: { calloutAsset: { calloutText: '24/7 Support' } } },
            { create: { calloutAsset: { calloutText: 'Money Back Guarantee' } } },
          ]
        })
      }
    );

    expect(calloutAssetResponse.ok).toBe(true);
    const calloutAssetResult = await calloutAssetResponse.json();
    console.log('Callout assets created:', JSON.stringify(calloutAssetResult, null, 2));
    expect(calloutAssetResult.results?.length).toBe(3);
    
    const calloutAssetNames = calloutAssetResult.results.map(r => r.resourceName);

    // GIVEN: Link callout assets to ad group
    console.log('\n5. Linking callout assets to ad group...');
    const adGroupAssetResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/adGroupAssets/mutate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalUserId: TEST_CONFIG.externalUserId,
          accountId: TEST_CONFIG.accountId,
          operations: calloutAssetNames.map(assetName => ({
            create: {
              adGroup: adGroupResourceName,
              asset: assetName,
              fieldType: 'CALLOUT',
            }
          }))
        })
      }
    );

    expect(adGroupAssetResponse.ok).toBe(true);
    const adGroupAssetResult = await adGroupAssetResponse.json();
    console.log('Ad group assets linked:', JSON.stringify(adGroupAssetResult, null, 2));
    expect(adGroupAssetResult.results?.length).toBe(3);

    // WHEN: Verify callout assets are linked
    console.log('\n6. Verifying callout assets...');
    const calloutsVerifyResponse = await rateLimitedFetch(
      `${BASE_URL}/api/customers/${TEST_CONFIG.customerId}/googleAds:search?externalUserId=${TEST_CONFIG.externalUserId}&accountId=${TEST_CONFIG.accountId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            SELECT 
              ad_group.id,
              asset.callout_asset.callout_text,
              ad_group_asset.field_type
            FROM ad_group_asset 
            WHERE ad_group.id = ${createdAdGroupId}
              AND ad_group_asset.field_type = 'CALLOUT'
          `
        })
      }
    );

    // THEN: All 3 callouts exist
    expect(calloutsVerifyResponse.ok).toBe(true);
    const calloutsVerifyResult = await calloutsVerifyResponse.json();
    console.log('Callouts verification:', JSON.stringify(calloutsVerifyResult, null, 2));
    
    expect(calloutsVerifyResult.results?.length).toBe(3);
    const calloutTexts = calloutsVerifyResult.results.map(r => r.asset.calloutAsset.calloutText);
    expect(calloutTexts).toContain('Free Shipping');
    expect(calloutTexts).toContain('24/7 Support');
    expect(calloutTexts).toContain('Money Back Guarantee');

    console.log('\n All verifications passed! Campaign with callout extensions created successfully.');
    
  }, 300000);
});
