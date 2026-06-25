import crypto from 'node:crypto';
import { buildCatalogFromTables } from './catalog-transform.mjs';

let cachedCatalog;
let cachedUntil = 0;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claim}`;
  const privateKey = requiredEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsignedToken), privateKey).toString('base64url');
  const assertion = `${unsignedToken}.${signature}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  return (await response.json()).access_token;
}

function records(values = []) {
  const [headers = [], ...rows] = values;
  return rows
    .filter((row) => row.some((value) => value !== null && value !== ''))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

async function sheetTables(token) {
  const sheetId = encodeURIComponent(requiredEnv('GOOGLE_SHEET_ID'));
  const params = new URLSearchParams();
  params.append('ranges', 'Products!A3:R');
  params.append('ranges', 'Profiles!A3:D');
  params.append('ranges', 'Media!A3:D');
  params.set('majorDimension', 'ROWS');
  params.set('valueRenderOption', 'UNFORMATTED_VALUE');
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not read Google Sheet (${response.status})`);
  const ranges = (await response.json()).valueRanges ?? [];
  return {
    products: records(ranges[0]?.values),
    profiles: records(ranges[1]?.values),
    media: records(ranges[2]?.values),
  };
}

export async function getCatalogFromGoogleSheets() {
  const now = Date.now();
  if (cachedCatalog && now < cachedUntil) return cachedCatalog;
  const token = await googleToken();
  const tables = await sheetTables(token);
  const catalog = buildCatalogFromTables(tables.products, tables.profiles, tables.media);
  if (catalog.categories.length === 0) throw new Error('Google Sheet contains no fish categories');
  cachedCatalog = catalog;
  cachedUntil = now + Math.max(Number(process.env.CATALOG_CACHE_MS) || 30_000, 5_000);
  return catalog;
}
