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

async function getCustomerCurrency({ externalUserId, accountId, customerId, loginCustomerId = null }) {
  const result = await makeGoogleAdsRequest({
    externalUserId,
    accountId,
    path: `/customers/${customerId}/googleAds:search`,
    method: 'POST',
    body: { query: 'SELECT customer.currency_code FROM customer LIMIT 1' },
    loginCustomerId
  });

  if (result.results && result.results.length > 0) {
    return result.results[0].customer.currencyCode;
  }
  throw new Error('Could not retrieve customer currency code');
}

async function convertUsdToTargetCurrency(amountUsd, targetCurrency) {
  if (targetCurrency === 'USD') {
    return amountUsd;
  }

  const response = await fetch(
    `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${targetCurrency}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rate: ${response.status}`);
  }

  const data = await response.json();
  const rate = data.rates[targetCurrency];
  
  if (!rate) {
    throw new Error(`Exchange rate not found for currency: ${targetCurrency}`);
  }

  return amountUsd * rate;
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

function normalizeUrl(fullUrl) {
  try {
    const url = new URL(fullUrl);
    const pathSegments = url.pathname.split('/').filter(s => s.length > 0);
    return {
      finalUrl: url.origin,
      path1: (pathSegments[0] || '').substring(0, 15),
      path2: (pathSegments[1] || '').substring(0, 15)
    };
  } catch (e) {
    return { finalUrl: fullUrl, path1: '', path2: '' };
  }
}

// Create a complete campaign with all assets via batch job
app.post('/api/customers/:customerId/createCompleteCampaign', async (req, res) => {
  try {
    const { customerId } = req.params;
    const {
      externalUserId,
      accountId,
      campaignName,
      budgetAmountMicros = 10000,
      status = 'PAUSED',
      adGroupName,
      keywords = [],
      adHeadlines = [],
      adDescriptions = [],
      finalUrl,
      displayPath1,
      displayPath2,
      // Max CPC (in USD)
      maxCpcUsd = 1.00,
      // Optional extensions
      sitelinks,
      promotion,
      prices,
      call,
      callouts,
      leadForm,
      app: mobileApp,
      loginCustomerId
    } = req.body;

    if (!externalUserId || !accountId) {
      return res.status(400).json({ error: 'externalUserId and accountId are required' });
    }

    // Normalize URL and extract paths
    const urlParts = normalizeUrl(finalUrl || 'https://example.com');
    const normalizedFinalUrl = urlParts.finalUrl;
    const path1 = displayPath1 !== undefined ? displayPath1 : urlParts.path1;
    const path2 = displayPath2 !== undefined ? displayPath2 : urlParts.path2;

    const customerCurrency = await getCustomerCurrency({ externalUserId, accountId, customerId, loginCustomerId });
    const maxCpcInCustomerCurrency = await convertUsdToTargetCurrency(maxCpcUsd, customerCurrency);
    const cpcBidMicros = String(Math.round(maxCpcInCustomerCurrency * 1000000 / 10000) * 10000);

    // 1. Create Campaign Budget
    console.log('Creating campaign budget...');
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
      loginCustomerId: loginCustomerId || customerId,
    });

    const budgetResourceName = budgetResult.results?.[0]?.resourceName;
    if (!budgetResourceName) {
      throw new Error('Failed to create budget: ' + JSON.stringify(budgetResult));
    }
    console.log('Budget created:', budgetResourceName);

    // 2. Create Campaign
    console.log('Creating campaign...');
    const campaignResult = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/campaigns:mutate`,
      method: 'POST',
      body: {
        operations: [{
          create: {
            name: campaignName,
            advertisingChannelType: 'SEARCH',
            status,
            manualCpc: {},
            campaignBudget: budgetResourceName,
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
      loginCustomerId: loginCustomerId || customerId,
    });

    const campaignResourceName = campaignResult.results?.[0]?.resourceName;
    if (!campaignResourceName) {
      throw new Error('Failed to create campaign: ' + JSON.stringify(campaignResult));
    }
    console.log('Campaign created:', campaignResourceName);

    let adGroupResourceName = null;
    let createdAdGroup = null;

    // 3. Create Ad Group (if adGroupName provided)
    if (adGroupName) {
      console.log('Creating ad group...');
      const adGroupResult = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/customers/${customerId}/adGroups:mutate`,
        method: 'POST',
        body: {
          operations: [{
            create: {
              name: adGroupName,
              campaign: campaignResourceName,
              type: 'SEARCH_STANDARD',
              status: 'ENABLED',
              cpcBidMicros,
            }
          }]
        },
        loginCustomerId: loginCustomerId || customerId,
      });

      adGroupResourceName = adGroupResult.results?.[0]?.resourceName;
      if (!adGroupResourceName) {
        throw new Error('Failed to create ad group: ' + JSON.stringify(adGroupResult));
      }
      console.log('Ad group created:', adGroupResourceName);
      createdAdGroup = { resourceName: adGroupResourceName, name: adGroupName };
    }

    // 4. Create Keywords (if ad group exists and keywords provided)
    if (adGroupResourceName && keywords && keywords.length > 0) {
      console.log(`Creating ${keywords.length} keywords...`);
      const keywordOperations = keywords.map(keyword => {
        const kw = typeof keyword === 'string' ? { text: keyword, matchType: 'BROAD' } : keyword;
        return {
          create: {
            adGroup: adGroupResourceName,
            status: 'ENABLED',
            keyword: {
              text: kw.text,
              matchType: kw.matchType || 'BROAD',
            }
          }
        };
      });

      const keywordsResult = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/customers/${customerId}/adGroupCriteria:mutate`,
        method: 'POST',
        body: { operations: keywordOperations },
        loginCustomerId: loginCustomerId || customerId,
      });
      console.log('Keywords created:', keywordsResult.results?.length || 0);
    }

    // 5. Create Responsive Search Ad (if ad group exists and ad content provided)
    if (adGroupResourceName && adHeadlines.length >= 2 && adDescriptions.length >= 2 && finalUrl) {
      console.log('Creating responsive search ad...');
      const headlines = adHeadlines.map(h => ({ text: h.substring(0, 30) }));
      const descriptions = adDescriptions.map(d => ({ text: d.substring(0, 90) }));

      const adCreatePayload = {
        adGroup: adGroupResourceName,
        status: 'ENABLED',
        ad: {
          responsiveSearchAd: {
            headlines,
            descriptions,
          },
          finalUrls: [normalizedFinalUrl],
        }
      };

      // Add display paths if provided
      if (path1) {
        adCreatePayload.ad.responsiveSearchAd.path1 = path1.substring(0, 15);
      }
      if (path2) {
        adCreatePayload.ad.responsiveSearchAd.path2 = path2.substring(0, 15);
      }

      const adResult = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/customers/${customerId}/adGroupAds:mutate`,
        method: 'POST',
        body: {
          operations: [{ create: adCreatePayload }]
        },
        loginCustomerId: loginCustomerId || customerId,
      });
      console.log('Ad created:', adResult.results?.[0]?.resourceName);
    }

    // 6. Create Callout Assets (if ad group exists and callouts provided)
    if (adGroupResourceName && callouts && callouts.length > 0) {
      console.log(`Creating ${callouts.length} callout assets...`);
      
      for (const calloutItem of callouts) {
        const calloutText = typeof calloutItem === 'string' ? calloutItem : calloutItem.text;
        const startDate = typeof calloutItem === 'object' ? calloutItem.startDate : undefined;
        const endDate = typeof calloutItem === 'object' ? calloutItem.endDate : undefined;

        if (calloutText && calloutText.trim()) {
          // Create the callout asset
          const calloutAssetPayload = {
            calloutAsset: {
              calloutText: calloutText.substring(0, 25),
            }
          };

          // Add date scheduling if provided
          if (startDate) {
            calloutAssetPayload.calloutAsset.startDate = startDate;
          }
          if (endDate) {
            calloutAssetPayload.calloutAsset.endDate = endDate;
          }

          const assetResult = await makeGoogleAdsRequest({
            externalUserId,
            accountId,
            path: `/customers/${customerId}/assets:mutate`,
            method: 'POST',
            body: {
              operations: [{ create: calloutAssetPayload }]
            },
            loginCustomerId: loginCustomerId || customerId,
          });

          const assetResourceName = assetResult.results?.[0]?.resourceName;
          if (assetResourceName) {
            // Link the asset to the ad group
            await makeGoogleAdsRequest({
              externalUserId,
              accountId,
              path: `/customers/${customerId}/adGroupAssets:mutate`,
              method: 'POST',
              body: {
                operations: [{
                  create: {
                    adGroup: adGroupResourceName,
                    asset: assetResourceName,
                    fieldType: 'CALLOUT',
                    status: 'ENABLED',
                  }
                }]
              },
              loginCustomerId: loginCustomerId || customerId,
            });
            console.log('Callout asset created and linked:', assetResourceName);
          }
        }
      }
    }

    // 7. Create Sitelink Assets (if ad group exists and sitelinks provided)
    if (adGroupResourceName && sitelinks && sitelinks.length > 0) {
      console.log(`Creating ${sitelinks.length} sitelink assets...`);
      
      for (const sitelink of sitelinks) {
        const sitelinkAssetPayload = {
          finalUrls: [sitelink.finalUrl],
          sitelinkAsset: {
            linkText: sitelink.text.substring(0, 25),
          }
        };
        
        if (sitelink.description1) {
          sitelinkAssetPayload.sitelinkAsset.description1 = sitelink.description1.substring(0, 35);
        }
        if (sitelink.description2) {
          sitelinkAssetPayload.sitelinkAsset.description2 = sitelink.description2.substring(0, 35);
        }

        const assetResult = await makeGoogleAdsRequest({
          externalUserId,
          accountId,
          path: `/customers/${customerId}/assets:mutate`,
          method: 'POST',
          body: { operations: [{ create: sitelinkAssetPayload }] },
          loginCustomerId: loginCustomerId || customerId,
        });

        const assetResourceName = assetResult.results?.[0]?.resourceName;
        if (assetResourceName) {
          await makeGoogleAdsRequest({
            externalUserId,
            accountId,
            path: `/customers/${customerId}/adGroupAssets:mutate`,
            method: 'POST',
            body: {
              operations: [{
                create: {
                  adGroup: adGroupResourceName,
                  asset: assetResourceName,
                  fieldType: 'SITELINK',
                  status: 'ENABLED',
                }
              }]
            },
            loginCustomerId: loginCustomerId || customerId,
          });
          console.log('Sitelink asset created and linked:', assetResourceName);
        }
      }
    }

    // 8. Create Promotion Asset (if ad group exists and promotion provided)
    if (adGroupResourceName && promotion) {
      console.log('Creating promotion asset...');
      
      const promotionAssetPayload = {
        finalUrls: [promotion.finalUrl || normalizedFinalUrl],
        promotionAsset: {
          promotionTarget: promotion.promotionTarget || 'Sale',
          discountModifier: promotion.discountModifier || 'UP_TO',
          redemptionStartDate: promotion.startDate,
          redemptionEndDate: promotion.endDate,
          languageCode: promotion.languageCode || 'en',
        }
      };

      if (promotion.percentOff) {
        promotionAssetPayload.promotionAsset.percentOff = String(promotion.percentOff * 10000);
      } else if (promotion.moneyAmountOff) {
        promotionAssetPayload.promotionAsset.moneyAmountOff = {
          currencyCode: promotion.currencyCode || 'USD',
          amountMicros: String(promotion.moneyAmountOff * 1000000),
        };
      }

      if (promotion.promotionCode) {
        promotionAssetPayload.promotionAsset.promotionCode = promotion.promotionCode;
      }

      const assetResult = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/customers/${customerId}/assets:mutate`,
        method: 'POST',
        body: { operations: [{ create: promotionAssetPayload }] },
        loginCustomerId: loginCustomerId || customerId,
      });

      const assetResourceName = assetResult.results?.[0]?.resourceName;
      if (assetResourceName) {
        await makeGoogleAdsRequest({
          externalUserId,
          accountId,
          path: `/customers/${customerId}/adGroupAssets:mutate`,
          method: 'POST',
          body: {
            operations: [{
              create: {
                adGroup: adGroupResourceName,
                asset: assetResourceName,
                fieldType: 'PROMOTION',
                status: 'ENABLED',
              }
            }]
          },
          loginCustomerId: loginCustomerId || customerId,
        });
        console.log('Promotion asset created and linked:', assetResourceName);
      }
    }

    // 9. Create Price Asset (if ad group exists and prices provided)
    if (adGroupResourceName && prices && prices.header && prices.items?.length > 0) {
      console.log('Creating price asset...');
      
      const priceOfferings = prices.items.map(item => ({
        header: item.header.substring(0, 25),
        description: item.description?.substring(0, 25) || '',
        price: {
          currencyCode: item.currencyCode || 'USD',
          amountMicros: String((item.price || 0) * 1000000),
        },
        unit: item.unit || 'PER_MONTH',
        finalUrl: item.finalUrl || normalizedFinalUrl,
      }));

      const priceAssetPayload = {
        priceAsset: {
          type: prices.type || 'SERVICES',
          priceQualifier: prices.priceQualifier || 'FROM',
          languageCode: prices.languageCode || 'en',
          priceOfferings,
        }
      };

      const assetResult = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/customers/${customerId}/assets:mutate`,
        method: 'POST',
        body: { operations: [{ create: priceAssetPayload }] },
        loginCustomerId: loginCustomerId || customerId,
      });

      const assetResourceName = assetResult.results?.[0]?.resourceName;
      if (assetResourceName) {
        await makeGoogleAdsRequest({
          externalUserId,
          accountId,
          path: `/customers/${customerId}/adGroupAssets:mutate`,
          method: 'POST',
          body: {
            operations: [{
              create: {
                adGroup: adGroupResourceName,
                asset: assetResourceName,
                fieldType: 'PRICE',
                status: 'ENABLED',
              }
            }]
          },
          loginCustomerId: loginCustomerId || customerId,
        });
        console.log('Price asset created and linked:', assetResourceName);
      }
    }

    // Extract campaign info for response
    const campaignId = campaignResourceName.split('/').pop();
    const createdCampaign = {
      resourceName: campaignResourceName,
      id: campaignId,
      name: campaignName,
      status,
    };

    res.json({
      success: true,
      campaign: createdCampaign,
      adGroup: createdAdGroup,
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

// Get keywords for an ad group
app.get('/api/keywords', async (req, res) => {
  try {
    const { externalUserId, accountId, customerId, adGroupId } = req.query;
    
    if (!externalUserId || !accountId || !customerId || !adGroupId) {
      return res.status(400).json({ error: 'externalUserId, accountId, customerId, and adGroupId are required' });
    }

    const query = `
      SELECT 
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.resource_name
      FROM ad_group_criterion
      WHERE ad_group.id = ${adGroupId}
        AND ad_group_criterion.type = 'KEYWORD'
    `;

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
    console.error('Error fetching keywords:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mutate ad group criteria (keywords)
app.post('/api/customers/:customerId/adGroupCriteria/mutate', async (req, res) => {
  try {
    const { customerId } = req.params;
    const { externalUserId, accountId, operations, loginCustomerId } = req.body;

    if (!externalUserId || !accountId || !operations) {
      return res.status(400).json({ error: 'externalUserId, accountId, and operations are required' });
    }

    const result = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/adGroupCriteria:mutate`,
      method: 'POST',
      body: { operations },
      loginCustomerId: loginCustomerId || customerId,
    });

    res.json(result);
  } catch (error) {
    console.error('Error mutating ad group criteria:', error);
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
  console.log(`  GET  /api/keywords           - List keywords for ad group`);
  console.log(`  POST /api/customers/:id/adGroupCriteria/mutate - Update keywords`);
});
