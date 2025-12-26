/**
 * Google Drive Integration - Server-side only
 * Gestisce upload backup su Google Drive
 * 
 * Integrazione: connection:conn_google-drive_01KDCREACZ40HAZ64454G0GCCA
 */

import { google } from 'googleapis';
import { Readable } from 'stream';

let connectionSettings: any = null;
let lastTokenFetch: number = 0;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface DriveConnectionStatus {
  connected: boolean;
  email?: string;
  needsReconnection: boolean;
  error?: string;
}

async function fetchFreshToken(): Promise<{ access_token: string; expires_at?: string; email?: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME || 'connectors.replit.com';
  
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('GOOGLE_DRIVE_RECONNECTION_NEEDED: Token Replit non disponibile');
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-drive`,
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('GOOGLE_DRIVE_RECONNECTION_NEEDED: Token scaduto. Vai su Impostazioni → Integrazioni → Riconnetti Google Drive');
    }
    throw new Error(`Google Drive API error: ${response.status}`);
  }

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn?.settings) {
    throw new Error('GOOGLE_DRIVE_RECONNECTION_NEEDED: Google Drive non connesso');
  }

  const accessToken = conn.settings.access_token ?? conn.settings.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('GOOGLE_DRIVE_RECONNECTION_NEEDED: Access token mancante');
  }

  return {
    access_token: accessToken,
    expires_at: conn.settings.expires_at,
    email: conn.settings.email,
  };
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  if (connectionSettings?.settings?.access_token) {
    const expiresAt = connectionSettings.settings.expires_at;
    if (expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      const safeExpiresAt = expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
      
      if (now < safeExpiresAt && (now - lastTokenFetch) < 30000) {
        return connectionSettings.settings.access_token;
      }
    }
  }

  console.log('🔐 Google Drive: fetching fresh token from connector...');
  
  const tokenInfo = await fetchFreshToken();
  
  connectionSettings = {
    settings: {
      access_token: tokenInfo.access_token,
      expires_at: tokenInfo.expires_at,
      email: tokenInfo.email,
    }
  };
  lastTokenFetch = now;
  
  console.log('✅ Google Drive token obtained successfully');
  return tokenInfo.access_token;
}

async function getGoogleDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function getDriveConnectionStatus(): Promise<DriveConnectionStatus> {
  try {
    const tokenInfo = await fetchFreshToken();
    return {
      connected: true,
      email: tokenInfo.email,
      needsReconnection: false,
    };
  } catch (error: any) {
    return {
      connected: false,
      needsReconnection: true,
      error: error.message,
    };
  }
}

export async function findOrCreateBackupFolder(): Promise<string> {
  const drive = await getGoogleDriveClient();
  
  const folderName = 'Image Studio Backups';
  
  const searchResponse = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    console.log(`📁 Found existing backup folder: ${searchResponse.data.files[0].id}`);
    return searchResponse.data.files[0].id!;
  }

  const createResponse = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  console.log(`📁 Created new backup folder: ${createResponse.data.id}`);
  return createResponse.data.id!;
}

export async function uploadBackupToDrive(
  backupData: any,
  filename: string
): Promise<{ fileId: string; webViewLink?: string }> {
  const drive = await getGoogleDriveClient();
  
  const folderId = await findOrCreateBackupFolder();
  
  const jsonContent = JSON.stringify(backupData, null, 2);
  const buffer = Buffer.from(jsonContent, 'utf-8');
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType: 'application/json',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id, webViewLink',
  });

  console.log(`✅ Backup uploaded to Google Drive: ${response.data.id}`);
  
  return {
    fileId: response.data.id!,
    webViewLink: response.data.webViewLink || undefined,
  };
}

export async function listBackupsFromDrive(): Promise<Array<{
  id: string;
  name: string;
  createdTime: string;
  size: string;
  webViewLink?: string;
}>> {
  const drive = await getGoogleDriveClient();
  
  const folderId = await findOrCreateBackupFolder();
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id, name, createdTime, size, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: 20,
  });

  return (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    createdTime: file.createdTime!,
    size: file.size || '0',
    webViewLink: file.webViewLink || undefined,
  }));
}

export async function downloadBackupFromDrive(fileId: string): Promise<any> {
  const drive = await getGoogleDriveClient();
  
  const response = await drive.files.get({
    fileId,
    alt: 'media',
  }, {
    responseType: 'text',
  });

  if (typeof response.data === 'string') {
    try {
      return JSON.parse(response.data);
    } catch (e) {
      console.error('Failed to parse backup JSON:', e);
      throw new Error('Invalid backup file format');
    }
  }
  
  return response.data;
}

export async function deleteBackupFromDrive(fileId: string): Promise<void> {
  const drive = await getGoogleDriveClient();
  
  await drive.files.delete({
    fileId,
  });
  
  console.log(`🗑️ Backup deleted from Google Drive: ${fileId}`);
}
