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
} = process.env;

// Initialize Pipedream client
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

const GOOGLE_ADS_VERSION = 'v18';

async function makeGoogleAdsRequest({ externalUserId, accountId, path, method = 'GET', body = null, loginCustomerId = null }) {
  const accessToken = await getPipedreamAccessToken();
  
  const upstreamUrl = `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}${path}`;
  const encodedUrl = Buffer.from(upstreamUrl).toString('base64url');
  
  const proxyUrl = `https://api.pipedream.com/v1/connect/${PIPEDREAM_PROJECT_ID}/proxy/${encodedUrl}?external_user_id=${encodeURIComponent(externalUserId)}&account_id=${encodeURIComponent(accountId)}`;
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'x-pd-environment': PIPEDREAM_PROJECT_ENVIRONMENT,
  };
  
  if (loginCustomerId) {
    headers['x-pd-proxy-login-customer-id'] = loginCustomerId;
  }
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions = { method, headers };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  console.log(`Google Ads ${method} ${path}`);
  
  const response = await fetch(proxyUrl, fetchOptions);
  const text = await response.text();
  
  console.log(`Response: ${response.status}`, text.substring(0, 500));
  
  if (!response.ok) {
    console.error(`Google Ads API error: ${response.status}`, text);
    throw new Error(`Google Ads API error: ${response.status} - ${text}`);
  }
  
  return text ? JSON.parse(text) : { status: response.status };
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /api/connect-token      - Get connect token for OAuth`);
  console.log(`  GET  /api/accounts           - List connected Google Ads accounts`);
  console.log(`  GET  /api/customers          - List accessible customers (via proxy)`);
  console.log(`  GET  /api/customers/:id      - Get customer details`);
  console.log(`  GET  /api/campaigns          - List campaigns (requires customerId)`);
  console.log(`  GET  /api/ad-groups          - List ad groups (requires customerId)`);
  console.log(`  GET  /api/ads                - List ads (requires customerId)`);
  console.log(`  POST /api/customers/:id/googleAds:search - Run GAQL query`);
  console.log(`  GET  /api/google-ads-actions - List available Pipedream actions`);
  console.log(`  POST /api/run-action         - Run a Google Ads action`);
});
