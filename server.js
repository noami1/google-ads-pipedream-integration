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
    const cpcBidMicros = String(Math.round(maxCpcInCustomerCurrency * 1000000));

    // Create batch job
    const batchJobResult = await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/customers/${customerId}/batchJobs:mutate`,
      method: 'POST',
      body: {
        operation: { create: {} }
      },
      loginCustomerId: loginCustomerId || customerId,
    });

    const batchJobResourceName = batchJobResult.result?.resourceName;
    if (!batchJobResourceName) {
      throw new Error('Failed to create batch job');
    }

    // Build mutate operations
    const mutateOperations = [];
    let assetTempId = -10;

    // 1. Campaign Budget (temp ID: -1)
    mutateOperations.push({
      campaignBudgetOperation: {
        create: {
          resourceName: `customers/${customerId}/campaignBudgets/-1`,
          name: `${campaignName} Budget`,
          deliveryMethod: 'STANDARD',
          amountMicros: String(budgetAmountMicros),
        }
      }
    });

    // 2. Campaign (temp ID: -2)
    mutateOperations.push({
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
          },
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        }
      }
    });

    // 3. Ad Group (temp ID: -3)
    if (adGroupName) {
      mutateOperations.push({
        adGroupOperation: {
          create: {
            resourceName: `customers/${customerId}/adGroups/-3`,
            name: adGroupName,
            campaign: `customers/${customerId}/campaigns/-2`,
            type: 'SEARCH_STANDARD',
            status: 'ENABLED',
            cpcBidMicros,
          }
        }
      });
    }

    // 4. Keywords
    if (keywords && keywords.length > 0) {
      keywords.forEach((keyword, index) => {
        const kw = typeof keyword === 'string' ? { text: keyword, matchType: 'BROAD' } : keyword;
        mutateOperations.push({
          adGroupCriterionOperation: {
            create: {
              adGroup: `customers/${customerId}/adGroups/-3`,
              status: 'ENABLED',
              keyword: {
                text: kw.text,
                matchType: kw.matchType || 'BROAD',
              }
            }
          }
        });
      });
    }

    // 5. Responsive Search Ad
    if (adHeadlines.length >= 2 && adDescriptions.length >= 2 && finalUrl) {
      const headlines = adHeadlines.map(h => ({ text: h.substring(0, 30) }));
      const descriptions = adDescriptions.map(d => ({ text: d.substring(0, 90) }));

      const adOperation = {
        adGroupAdOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            status: 'ENABLED',
            ad: {
              responsiveSearchAd: {
                headlines,
                descriptions,
              },
              finalUrls: [normalizedFinalUrl],
            }
          }
        }
      };

      // Add display paths if provided
      if (path1) {
        adOperation.adGroupAdOperation.create.ad.responsiveSearchAd.path1 = path1.substring(0, 15);
      }
      if (path2) {
        adOperation.adGroupAdOperation.create.ad.responsiveSearchAd.path2 = path2.substring(0, 15);
      }

      mutateOperations.push(adOperation);
    }

    // 6. Promotion Asset
    if (promotion && (promotion.promotionTarget || promotion.finalUrl)) {
      const promotionAssetTempId = assetTempId--;
      const promotionAsset = {
        resourceName: `customers/${customerId}/assets/${promotionAssetTempId}`,
        promotionAsset: {
          promotionTarget: (promotion.promotionTarget || '').substring(0, 20),
          languageCode: promotion.languageCode || 'en',
        }
      };

      if (promotion.finalUrl) {
        promotionAsset.finalUrls = [promotion.finalUrl];
      }

      if (promotion.redemptionStartDate) {
        promotionAsset.promotionAsset.redemptionStartDate = promotion.redemptionStartDate;
      }
      if (promotion.redemptionEndDate) {
        promotionAsset.promotionAsset.redemptionEndDate = promotion.redemptionEndDate;
      }

      if (promotion.moneyAmountOff) {
        promotionAsset.promotionAsset.moneyAmountOff = {
          amountMicros: String(Math.round(promotion.moneyAmountOff.amount * 1000000)),
          currencyCode: promotion.moneyAmountOff.currencyCode || 'USD'
        };
      } else if (promotion.percentOff) {
        promotionAsset.promotionAsset.percentOff = String(promotion.percentOff * 1000000);
      }

      if (promotion.occasion && promotion.occasion !== 'NONE' && promotion.occasion !== '') {
        promotionAsset.promotionAsset.occasion = promotion.occasion;
      }
      if (promotion.promotionCode) {
        promotionAsset.promotionAsset.promotionCode = promotion.promotionCode;
      }
      if (promotion.ordersOverAmount) {
        promotionAsset.promotionAsset.ordersOverAmount = {
          amountMicros: String(Math.round(promotion.ordersOverAmount.amount * 1000000)),
          currencyCode: promotion.ordersOverAmount.currencyCode || 'USD'
        };
      }

      mutateOperations.push({ assetOperation: { create: promotionAsset } });

      // Link to ad group
      mutateOperations.push({
        adGroupAssetOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            asset: `customers/${customerId}/assets/${promotionAssetTempId}`,
            fieldType: 'PROMOTION',
          }
        }
      });
    }

    // 7. Price Asset
    if (prices && prices.offerings && prices.offerings.length >= 3) {
      const priceAssetTempId = assetTempId--;
      const priceOfferings = prices.offerings.map(o => ({
        header: o.header.substring(0, 25),
        description: o.description.substring(0, 25),
        price: {
          amountMicros: String(Math.round(o.price.amount * 1000000)),
          currencyCode: o.price.currencyCode || 'USD'
        },
        finalUrl: o.finalUrl,
        unit: o.unit || 'UNSPECIFIED',
      }));

      const priceAsset = {
        resourceName: `customers/${customerId}/assets/${priceAssetTempId}`,
        priceAsset: {
          type: prices.type,
          priceOfferings,
          languageCode: prices.languageCode || 'en',
        }
      };

      if (prices.priceQualifier && prices.priceQualifier !== 'NONE') {
        priceAsset.priceAsset.priceQualifier = prices.priceQualifier;
      }

      mutateOperations.push({ assetOperation: { create: priceAsset } });

      mutateOperations.push({
        adGroupAssetOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            asset: `customers/${customerId}/assets/${priceAssetTempId}`,
            fieldType: 'PRICE',
          }
        }
      });
    }

    // 8. Call Asset
    if (call && call.phoneNumber) {
      const callAssetTempId = assetTempId--;
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: `customers/${customerId}/assets/${callAssetTempId}`,
            callAsset: {
              countryCode: call.countryCode || 'US',
              phoneNumber: call.phoneNumber,
            }
          }
        }
      });

      mutateOperations.push({
        adGroupAssetOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            asset: `customers/${customerId}/assets/${callAssetTempId}`,
            fieldType: 'CALL',
          }
        }
      });
    }

    // 9. Callout Assets
    if (callouts && callouts.length > 0) {
      callouts.forEach(calloutItem => {
        // Support both string format and object format with dates
        const calloutText = typeof calloutItem === 'string' ? calloutItem : calloutItem.text;
        const startDate = typeof calloutItem === 'object' ? calloutItem.startDate : undefined;
        const endDate = typeof calloutItem === 'object' ? calloutItem.endDate : undefined;
        
        if (calloutText && calloutText.trim()) {
          const calloutAssetTempId = assetTempId--;
          const calloutAsset = {
            resourceName: `customers/${customerId}/assets/${calloutAssetTempId}`,
            calloutAsset: {
              calloutText: calloutText.substring(0, 25),
            }
          };
          
          // Add date scheduling if provided
          if (startDate) {
            calloutAsset.calloutAsset.startDate = startDate;
          }
          if (endDate) {
            calloutAsset.calloutAsset.endDate = endDate;
          }
          
          mutateOperations.push({
            assetOperation: { create: calloutAsset }
          });

          mutateOperations.push({
            adGroupAssetOperation: {
              create: {
                adGroup: `customers/${customerId}/adGroups/-3`,
                asset: `customers/${customerId}/assets/${calloutAssetTempId}`,
                fieldType: 'CALLOUT',
              }
            }
          });
        }
      });
    }

    // 10. Lead Form Asset
    if (leadForm && leadForm.businessName && leadForm.headline && leadForm.privacyPolicyUrl) {
      const leadFormAssetTempId = assetTempId--;
      const leadFormFields = (leadForm.fields || []).map(f => ({ inputType: f }));

      const leadFormAsset = {
        resourceName: `customers/${customerId}/assets/${leadFormAssetTempId}`,
        leadFormAsset: {
          businessName: leadForm.businessName.substring(0, 25),
          headline: leadForm.headline.substring(0, 30),
          description: (leadForm.description || '').substring(0, 200),
          privacyPolicyUrl: leadForm.privacyPolicyUrl,
          callToActionType: leadForm.callToActionType || 'LEARN_MORE',
          callToActionDescription: (leadForm.callToActionDescription || '').substring(0, 30),
          fields: leadFormFields,
        }
      };

      if (leadForm.postSubmitHeadline) {
        leadFormAsset.leadFormAsset.postSubmitHeadline = leadForm.postSubmitHeadline.substring(0, 30);
      }
      if (leadForm.postSubmitDescription) {
        leadFormAsset.leadFormAsset.postSubmitDescription = leadForm.postSubmitDescription.substring(0, 200);
      }

      mutateOperations.push({ assetOperation: { create: leadFormAsset } });

      mutateOperations.push({
        adGroupAssetOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            asset: `customers/${customerId}/assets/${leadFormAssetTempId}`,
            fieldType: 'LEAD_FORM',
          }
        }
      });
    }

    // 11. Mobile App Asset
    if (mobileApp && mobileApp.appId && mobileApp.linkText) {
      const appAssetTempId = assetTempId--;
      mutateOperations.push({
        assetOperation: {
          create: {
            resourceName: `customers/${customerId}/assets/${appAssetTempId}`,
            mobileAppAsset: {
              appStore: mobileApp.appStore || 'GOOGLE_APP_STORE',
              appId: mobileApp.appId,
              linkText: mobileApp.linkText.substring(0, 25),
            }
          }
        }
      });

      mutateOperations.push({
        adGroupAssetOperation: {
          create: {
            adGroup: `customers/${customerId}/adGroups/-3`,
            asset: `customers/${customerId}/assets/${appAssetTempId}`,
            fieldType: 'MOBILE_APP',
          }
        }
      });
    }

    console.log(`Adding ${mutateOperations.length} operations to batch job`);

    // Add operations to batch job
    await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/${batchJobResourceName}:addOperations`,
      method: 'POST',
      body: { mutateOperations },
      loginCustomerId: loginCustomerId || customerId,
    });

    // Run the batch job
    await makeGoogleAdsRequest({
      externalUserId,
      accountId,
      path: `/${batchJobResourceName}:run`,
      method: 'POST',
      body: {},
      loginCustomerId: loginCustomerId || customerId,
    });

    // Poll for completion (with timeout)
    let batchJobStatus = 'PENDING';
    let results = null;
    const maxAttempts = 30;
    let attempts = 0;

    while (batchJobStatus !== 'DONE' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      try {
        const statusResult = await makeGoogleAdsRequest({
          externalUserId,
          accountId,
          path: `/${batchJobResourceName}`,
          method: 'GET',
          loginCustomerId: loginCustomerId || customerId,
        });

        batchJobStatus = statusResult.status || 'PENDING';
      } catch (e) {
        console.log('Polling status check failed (expected with some proxies):', e.message);
        break;
      }
    }

    // Try to get results
    try {
      const listResults = await makeGoogleAdsRequest({
        externalUserId,
        accountId,
        path: `/${batchJobResourceName}:listResults`,
        method: 'GET',
        loginCustomerId: loginCustomerId || customerId,
      });
      results = listResults.results;
    } catch (e) {
      console.log('Could not fetch batch job results:', e.message);
    }

    res.json({
      success: true,
      batchJob: batchJobResourceName,
      operationsCount: mutateOperations.length,
      status: batchJobStatus,
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
