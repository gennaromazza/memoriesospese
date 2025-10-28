/**
 * Script per estrarre credenziali Gmail OAuth dall'integrazione Replit
 * Da eseguire LOCALMENTE su Replit (non su Cloud Functions)
 */

async function extractGmailCredentials() {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken || !hostname) {
      throw new Error('Missing REPL_IDENTITY or REPLIT_CONNECTORS_HOSTNAME');
    }

    console.log('🔐 Fetching Gmail credentials from Replit Connectors API...');
    console.log(`📡 Hostname: ${hostname}`);

    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const connection = data.items?.[0];

    if (!connection) {
      throw new Error('Gmail connection not found');
    }

    console.log('\n✅ Gmail connection found!');
    console.log('\n📋 Connection Settings:');
    console.log(JSON.stringify(connection.settings, null, 2));

    // Estrai credenziali OAuth
    const accessToken = connection.settings?.access_token || 
                       connection.settings?.oauth?.credentials?.access_token;
    const refreshToken = connection.settings?.refresh_token ||
                        connection.settings?.oauth?.credentials?.refresh_token;
    const clientId = connection.settings?.client_id ||
                    connection.settings?.oauth?.client_id;
    const clientSecret = connection.settings?.client_secret ||
                        connection.settings?.oauth?.client_secret;
    const expiresAt = connection.settings?.expires_at;

    console.log('\n📧 Extracted OAuth Credentials:');
    console.log(`Access Token: ${accessToken ? accessToken.substring(0, 20) + '...' : 'NOT FOUND'}`);
    console.log(`Refresh Token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'NOT FOUND'}`);
    console.log(`Client ID: ${clientId || 'NOT FOUND'}`);
    console.log(`Client Secret: ${clientSecret ? clientSecret.substring(0, 10) + '...' : 'NOT FOUND'}`);
    console.log(`Expires At: ${expiresAt || 'NOT FOUND'}`);

    console.log('\n💡 Next steps:');
    console.log('1. Save these credentials as Firebase Secrets');
    console.log('2. Update gmail.ts to use direct OAuth instead of Replit API');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  }
}

extractGmailCredentials();
