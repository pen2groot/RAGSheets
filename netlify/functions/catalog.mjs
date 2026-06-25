import { getCatalogFromGoogleSheets } from '../../server/catalog-from-google-sheets.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const catalog = await getCatalogFromGoogleSheets();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=120',
        'Access-Control-Allow-Origin': process.env.CATALOG_ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify(catalog),
    };
  } catch (error) {
    console.error('Google Sheets catalogue sync failed', error);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Catalogue sync is temporarily unavailable' }),
    };
  }
}
