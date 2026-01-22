import express from 'express';
import { createBackendClient } from '@pipedream/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Validate required environment variables
const requiredEnvVars = ['PIPEDREAM_CLIENT_ID', 'PIPEDREAM_CLIENT_SECRET', 'PIPEDREAM_PROJECT_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const {
  PIPEDREAM_CLIENT_ID,
  PIPEDREAM_CLIENT_SECRET,
  PIPEDREAM_PROJECT_ID,
  PIPEDREAM_PROJECT_ENVIRONMENT = 'development',
  GOOGLE_ADS_DEVELOPER_TOKEN,
} = process.env;

const client = createBackendClient({
  credentials: {
    clientId: PIPEDREAM_CLIENT_ID,
    clientSecret: PIPEDREAM_CLIENT_SECRET,
  },
  projectId: PIPEDREAM_PROJECT_ID,
  environment: PIPEDREAM_PROJECT_ENVIRONMENT,
});

// Cache for Pipedream OAuth access token
let pdAccessToken = null;
let pdTokenExpiresAt = 0;

// Get OAuth access token for Pipedream API
async function getPipedreamAccessToken() {
  if (pdAccessToken && Date.now() < pdTokenExpiresAt - 60000) {
    return pdAccessToken;
  }

  const response = await fetch('https://api.pipedream.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: PIPEDREAM_CLIENT_ID,
      client_secret: PIPEDREAM_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Pipedream access token: ${response.status}`);
  }

  const data = await response.json();
  pdAccessToken = data.access_token;
  pdTokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return pdAccessToken;
}

// Generate a connect link URL for OAuth flow
app.post('/api/connect-token', async (req, res) => {
  try {
    const { externalUserId } = req.body;
    
    if (!externalUserId) {
      return res.status(400).json({ error: 'externalUserId is required' });
    }

    const callbackUrl = `http://localhost:${process.env.PORT || 3000}/callback`;
    
    const tokenResponse = await client.createConnectToken({
      external_user_id: externalUserId,
      success_redirect_uri: callbackUrl,
      error_redirect_uri: `${callbackUrl}?error=connection_failed`,
    });

    const connectLinkUrl = `https://pipedream.com/_static/connect.html?token=${tokenResponse.token}&connectLink=true&app=google_ads`;

    res.json({
      token: tokenResponse.token,
      expiresAt: tokenResponse.expires_at,
      connectLinkUrl,
    });
  } catch (error) {
    console.error('Error creating connect token:', error);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback handler
app.get('/callback', (req, res) => {
  const { accountId, error } = req.query;
  
  if (error) {
    res.send(`<html><body><h1>Connection Failed</h1><p>Error: ${error}</p><a href="/">Go back</a></body></html>`);
    return;
  }
  
  res.send(`
    <html>
    <head><title>Google Ads Connected!</title></head>
    <body>
      <h1>Google Ads Connected Successfully!</h1>
      <p>Account ID: ${accountId || 'Connected'}</p>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'google-ads-connected', accountId: '${accountId || ''}' }, '*');
          window.close();
        } else {
          setTimeout(() => window.location.href = '/', 2000);
        }
      </script>
    </body>
    </html>
  `);
});

// List connected Google Ads accounts for a user
app.get('/api/accounts', async (req, res) => {
  try {
    const { externalUserId } = req.query;
    
    if (!externalUserId) {
      return res.status(400).json({ error: 'externalUserId is required' });
    }

    const accessToken = await getPipedreamAccessToken();
    
    const response = await fetch(
      `https://api.pipedream.com/v1/connect/${PIPEDREAM_PROJECT_ID}/accounts?` + 
      new URLSearchParams({
        external_user_id: externalUserId,
        app: 'google_ads',
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-pd-environment': PIPEDREAM_PROJECT_ENVIRONMENT,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list accounts: ${response.status} - ${text}`);
    }

    const accounts = await response.json();
    res.json(accounts);
  } catch (error) {
    console.error('Error listing accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// List available Google Ads actions
app.get('/api/google-ads-actions', async (req, res) => {
  try {
    const accessToken = await getPipedreamAccessToken();
    
    const response = await fetch(
      `https://api.pipedream.com/v1/connect/${PIPEDREAM_PROJECT_ID}/actions?` + new URLSearchParams({
        app: 'google_ads',
      }),
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-pd-environment': PIPEDREAM_PROJECT_ENVIRONMENT,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list actions: ${response.status} - ${text}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error listing actions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get component details (props, etc.)
app.get('/api/component/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const accessToken = await getPipedreamAccessToken();
    
    const response = await fetch(
      `https://api.pipedream.com/v1/components/registry/${key}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get component: ${response.status} - ${text}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting component:', error);
    res.status(500).json({ error: error.message });
  }
});

// Run a Google Ads action using Pipedream's pre-built components
app.post('/api/run-action', async (req, res) => {
  try {
    const { externalUserId, accountId, actionKey, props } = req.body;
    
    if (!externalUserId || !accountId || !actionKey) {
      return res.status(400).json({ error: 'externalUserId, accountId, and actionKey are required' });
    }

    const accessToken = await getPipedreamAccessToken();
    
    // Configure props with the Google Ads account
    const configuredProps = {
      google_ads: {
        authProvisionId: accountId,
      },
      ...props,
    };

    console.log('Running action:', actionKey, 'with props:', JSON.stringify(configuredProps, null, 2));

    const response = await fetch(
      `https://api.pipedream.com/v1/connect/${PIPEDREAM_PROJECT_ID}/actions/${actionKey}/run`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-pd-environment': PIPEDREAM_PROJECT_ENVIRONMENT,
        },
        body: JSON.stringify({
          external_user_id: externalUserId,
          configured_props: configuredProps,
        }),
      }
    );

    const text = await response.text();
    
    if (!response.ok) {
      console.error('Action failed:', response.status, text);
      throw new Error(`Action failed: ${response.status} - ${text}`);
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { raw: text };
    }

    res.json({ 
      success: true, 
      message: 'Action executed successfully!',
      result,
    });
  } catch (error) {
    console.error('Error running action:', error);
    res.status(500).json({ error: error.message });
  }
});

const GOOGLE_ADS_VERSION = 'v19';
const GOOGLE_ADS_PROXY_URL = 'https://googleads.m.pipedream.net';

async function makeGoogleAdsRequest({ externalUserId, accountId, path, method = 'GET', body = null, loginCustomerId = null }) {
  const googleAdsRequestBody = {
    url: `/${GOOGLE_ADS_VERSION}${path}`,
    method: method.toUpperCase(),
  };
  
  if (body) {
    googleAdsRequestBody.data = body;
  }

  console.log(`Google Ads ${method} ${GOOGLE_ADS_PROXY_URL}${googleAdsRequestBody.url}`);
  console.log('Request:', JSON.stringify(googleAdsRequestBody, null, 2));

  const response = await client.makeProxyRequest(
    {
      searchParams: {
        external_user_id: externalUserId,
        account_id: accountId,
      },
    },
    {
      url: GOOGLE_ADS_PROXY_URL,
      options: {
        method: 'POST',
        body: googleAdsRequestBody,
      },
    }
  );
  
  console.log('Response:', JSON.stringify(response, null, 2).substring(0, 500));
  return response;
}

app.get('/api/customers', async (req, res) => {
  try {
    const { externalUserId, accountId } = req.query;
    
    if (!externalUserId || !accountId) {
      return res.status(400).json({ error: 'externalUserId and accountId are required' });
    }
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: '/customers:listAccessibleCustomers',
      method: 'GET',
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error listing customers:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { externalUserId, accountId, loginCustomerId } = req.query;
    
    if (!externalUserId || !accountId) {
      return res.status(400).json({ error: 'externalUserId and accountId are required' });
    }
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}`,
      method: 'GET',
      loginCustomerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers/:customerId/googleAds:search', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { externalUserId, accountId, loginCustomerId } = req.query;
    const { query } = req.body;
    
    if (!externalUserId || !accountId) {
      return res.status(400).json({ error: 'externalUserId and accountId are required' });
    }
    
    if (!query) {
      return res.status(400).json({ error: 'query is required in request body' });
    }
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query },
      loginCustomerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers/:customerId/:resource/mutate', async (req, res) => {
  try {
    const { customerId, resource } = req.params;
    const { externalUserId, accountId, operations, loginCustomerId } = req.body;
    
    if (!externalUserId || !accountId || !operations) {
      return res.status(400).json({ error: 'externalUserId, accountId, and operations are required' });
    }
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/${resource}:mutate`,
      method: 'POST',
      body: { operations },
      loginCustomerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error mutating:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers/:customerId/generateKeywordIdeas', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      externalUserId, 
      accountId, 
      keywords = [], 
      url,
      language = 'languageConstants/1000',
      geoTargetConstants = ['geoTargetConstants/2376'],
      loginCustomerId 
    } = req.body;
    
    if (!externalUserId || !accountId) {
      return res.status(400).json({ error: 'externalUserId and accountId are required' });
    }
    
    if (!keywords.length && !url) {
      return res.status(400).json({ error: 'At least one keyword or url is required' });
    }

    const requestBody = {
      language,
      geoTargetConstants,
      includeAdultKeywords: false,
      keywordPlanNetwork: 'GOOGLE_SEARCH',
    };

    if (keywords.length && url) {
      requestBody.keywordAndUrlSeed = { keywords, url };
    } else if (keywords.length) {
      requestBody.keywordSeed = { keywords };
    } else {
      requestBody.urlSeed = { url };
    }
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}:generateKeywordIdeas`,
      method: 'POST',
      body: requestBody,
      loginCustomerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error generating keyword ideas:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers/:customerId/createSimpleCampaign', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      externalUserId, 
      accountId, 
      campaignName,
      budgetAmountMicros = 10000,
      status = 'PAUSED',
      loginCustomerId 
    } = req.body;
    
    if (!externalUserId || !accountId || !campaignName) {
      return res.status(400).json({ error: 'externalUserId, accountId, and campaignName are required' });
    }

    const budgetResult = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/campaignBudgets:mutate`,
      method: 'POST',
      body: {
        operations: [{
          create: {
            name: `${campaignName} Budget`,
            deliveryMethod: 'STANDARD',
            amountMicros: String(budgetAmountMicros),
          }
        }]
      },
      loginCustomerId,
    });

    const budgetResourceName = budgetResult.results?.[0]?.resourceName;
    if (!budgetResourceName) {
      throw new Error('Failed to create budget: ' + JSON.stringify(budgetResult));
    }

    const campaignResult = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/campaigns:mutate`,
      method: 'POST',
      body: {
        operations: [{
          create: {
            campaignBudget: budgetResourceName,
            name: campaignName,
            advertisingChannelType: 'SEARCH',
            status,
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
      },
      loginCustomerId,
    });

    res.json({
      success: true,
      budget: budgetResult,
      campaign: campaignResult,
    });
  } catch (error) {
    console.error('Error creating simple campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers/:customerId/createCompleteCampaign', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { 
      externalUserId, 
      accountId, 
      campaignName,
      budgetAmountMicros = 10000,
      adGroupName,
      keywords = [],
      adHeadlines = [],
      adDescriptions = [],
      finalUrl,
      status = 'PAUSED',
      loginCustomerId 
    } = req.body;
    
    if (!externalUserId || !accountId || !campaignName) {
      return res.status(400).json({ error: 'externalUserId, accountId, and campaignName are required' });
    }

    const batchJobResult = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/batchJobs:mutate`,
      method: 'POST',
      body: {
        operation: { create: {} }
      },
      loginCustomerId,
    });

    const batchJobResourceName = batchJobResult.result?.resourceName;
    if (!batchJobResourceName) {
      throw new Error('Failed to create batch job: ' + JSON.stringify(batchJobResult));
    }

    const mutateOperations = [
      {
        campaignBudgetOperation: {
          create: {
            resourceName: `customers/${customerId}/campaignBudgets/-1`,
            name: `${campaignName} Budget`,
            deliveryMethod: 'STANDARD',
            amountMicros: String(budgetAmountMicros),
          }
        }
      },
      {
        campaignOperation: {
          create: {
            resourceName: `customers/${customerId}/campaigns/-2`,
            name: campaignName,
            advertisingChannelType: 'SEARCH',
            status,
            manualCpc: {},
            campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
              targetPartnerSearchNetwork: false,
            }
          }
        }
      }
    ];

    if (adGroupName) {
      mutateOperations.push({
        adGroupOperation: {
          create: {
            resourceName: `customers/${customerId}/adGroups/-3`,
            name: adGroupName,
            campaign: `customers/${customerId}/campaigns/-2`,
            type: 'SEARCH_STANDARD',
            status: 'ENABLED',
            cpcBidMicros: '1000000',
          }
        }
      });

      keywords.forEach((keyword, idx) => {
        mutateOperations.push({
          adGroupCriterionOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/-3`,
              status: 'ENABLED',
              keyword: {
                text: keyword,
                matchType: 'BROAD',
              }
            }
          }
        });
      });

      if (adHeadlines.length >= 3 && adDescriptions.length >= 2 && finalUrl) {
        mutateOperations.push({
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/-3`,
              status: 'ENABLED',
              ad: {
                responsiveSearchAd: {
                  headlines: adHeadlines.slice(0, 15).map(text => ({ text })),
                  descriptions: adDescriptions.slice(0, 4).map(text => ({ text })),
                },
                finalUrls: [finalUrl],
              }
            }
          }
        });
      }
    }

    await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/${batchJobResourceName}:addOperations`,
      method: 'POST',
      body: { mutateOperations },
      loginCustomerId,
    });

    await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/${batchJobResourceName}:run`,
      method: 'POST',
      body: {},
      loginCustomerId,
    });

    let results = null;
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
      
      try {
        const statusResult = await makeGoogleAdsRequest({
          externalUserId,
          accountId,
          path: `/${batchJobResourceName}`,
          method: 'GET',
          loginCustomerId,
        });
        
        if (statusResult.status === 'DONE') {
          results = await makeGoogleAdsRequest({
            externalUserId,
            accountId,
            path: `/${batchJobResourceName}:listResults`,
            method: 'GET',
            loginCustomerId,
          });
          break;
        }
      } catch (e) {
        console.log('Polling batch job status...', e.message);
      }
    }

    res.json({
      success: true,
      batchJob: batchJobResourceName,
      results,
    });
  } catch (error) {
    console.error('Error creating complete campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/campaigns', async (req, res) => {
  try {
    const { externalUserId, accountId, customerId, loginCustomerId } = req.query;
    
    if (!externalUserId || !accountId || !customerId) {
      return res.status(400).json({ error: 'externalUserId, accountId, and customerId are required' });
    }
    
    const query = `
      SELECT 
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.start_date,
        campaign.end_date,
        campaign_budget.amount_micros,
        campaign_budget.delivery_method
      FROM campaign
      ORDER BY campaign.name
    `;
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query },
      loginCustomerId: loginCustomerId || customerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ad-groups', async (req, res) => {
  try {
    const { externalUserId, accountId, customerId, campaignId, loginCustomerId } = req.query;
    
    if (!externalUserId || !accountId || !customerId) {
      return res.status(400).json({ error: 'externalUserId, accountId, and customerId are required' });
    }
    
    let query = `
      SELECT 
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.type,
        ad_group.cpc_bid_micros,
        campaign.id,
        campaign.name
      FROM ad_group
    `;
    
    if (campaignId) {
      query += ` WHERE campaign.id = ${campaignId}`;
    }
    
    query += ` ORDER BY ad_group.name`;
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query },
      loginCustomerId: loginCustomerId || customerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error listing ad groups:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ads', async (req, res) => {
  try {
    const { externalUserId, accountId, customerId, adGroupId, loginCustomerId } = req.query;
    
    if (!externalUserId || !accountId || !customerId) {
      return res.status(400).json({ error: 'externalUserId, accountId, and customerId are required' });
    }
    
    let query = `
      SELECT 
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        ad_group_ad.status,
        ad_group.id,
        ad_group.name
      FROM ad_group_ad
    `;
    
    if (adGroupId) {
      query += ` WHERE ad_group.id = ${adGroupId}`;
    }
    
    query += ` ORDER BY ad_group_ad.ad.id`;
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query },
      loginCustomerId: loginCustomerId || customerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error listing ads:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/account-details/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { externalUserId } = req.query;
    
    if (!externalUserId) {
      return res.status(400).json({ error: 'externalUserId is required' });
    }

    const accessToken = await getPipedreamAccessToken();
    
    const response = await fetch(
      `https://api.pipedream.com/v1/connect/${PIPEDREAM_PROJECT_ID}/accounts/${accountId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-pd-environment': PIPEDREAM_PROJECT_ENVIRONMENT,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get account details: ${response.status} - ${text}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error getting account details:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-simple', async (req, res) => {
  try {
    const { externalUserId, accountId, customerId } = req.query;
    
    if (!externalUserId || !accountId || !customerId) {
      return res.status(400).json({ error: 'externalUserId, accountId, and customerId are required' });
    }
    
    const query = `SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1`;
    
    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/googleAds:search`,
      method: 'POST',
      body: { query },
      loginCustomerId: customerId,
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error in test-simple:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/connect-token      - Get connect token for OAuth`);
  console.log(`  GET  /api/accounts           - List connected Google Ads accounts`);
  console.log(`  GET  /api/account-details/:id - Get account details (includes customer_id)`);
  console.log(`  GET  /api/test-simple        - Simple test query (needs customerId)`);
  console.log(`  GET  /api/customers          - List accessible customers (via proxy)`);
  console.log(`  GET  /api/customers/:id      - Get customer details`);
  console.log(`  GET  /api/campaigns          - List campaigns (requires customerId)`);
  console.log(`  GET  /api/ad-groups          - List ad groups (requires customerId)`);
  console.log(`  GET  /api/ads                - List ads (requires customerId)`);
  console.log(`  POST /api/customers/:id/googleAds:search - Run GAQL query`);
  console.log(`  GET  /api/google-ads-actions - List available Pipedream actions`);
  console.log(`  POST /api/run-action         - Run a Google Ads action`);
});
