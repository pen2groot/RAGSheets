const fs = require('fs');
const path = require('path');
const https = require('https');

const catalogPath = path.join(__dirname, '..', 'public', 'catalog.json');
const outputDir = path.join(__dirname, '..', 'public', 'assets', 'plants');
const creditsPath = path.join(outputDir, 'plant-image-credits.json');
const userAgent = 'RagsAquaWorldPlantImageUpdater/1.0 (local catalog image update; contact: ragsaquaworld@gmail.com)';

const blockedTitleWords = [
  'pot',
  'potted',
  'flower',
  'flowers',
  'fruit',
  'seed',
  'seeds',
  'herbarium',
  'drawing',
  'illustration',
  'map',
  'range',
  'scan',
  'plate',
];

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanName(name) {
  return name.replace(/\([^)]*\)/g, '').trim();
}

function baseScientificName(name) {
  const cleaned = cleanName(name);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^[A-Z]/.test(parts[0]) && /^[a-z]/.test(parts[1])) {
    return `${parts[0]} ${parts[1]}`;
  }
  return cleaned;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': userAgent } }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadOnce(url, filePath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const file = fs.createWriteStream(filePath);
    https
      .get(url, { headers: { 'User-Agent': userAgent, Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.rmSync(filePath, { force: true });
          download(res.headers.location, filePath).then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          file.close();
          fs.rmSync(filePath, { force: true });
          reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (error) => {
        file.close();
        fs.rmSync(filePath, { force: true });
        reject(error);
      });
  });
}

async function download(url, filePath, attempt = 1) {
  try {
    await downloadOnce(url, filePath);
  } catch (error) {
    if (/HTTP 429/.test(String(error.message)) && attempt <= 4) {
      await wait(2500 * attempt);
      return download(url, filePath, attempt + 1);
    }
    throw error;
  }
}

function wikiSearchUrl(query) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '12',
    gsrsearch: query,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '900',
    format: 'json',
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

function isUsableImage(page) {
  const info = page.imageinfo && page.imageinfo[0];
  if (!info || !info.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime || '')) {
    return false;
  }
  const title = (page.title || '').toLowerCase();
  return !blockedTitleWords.some((word) => title.includes(word));
}

function scorePage(page, plantName, query) {
  const title = (page.title || '').toLowerCase();
  const cleaned = cleanName(plantName).toLowerCase();
  const base = baseScientificName(plantName).toLowerCase();
  let score = 0;
  if (title.includes(cleaned)) score += 80;
  if (title.includes(base)) score += 45;
  if (title.includes('aquarium')) score += 18;
  if (title.includes('submers')) score += 16;
  if (title.includes('plant')) score += 8;
  if (query.toLowerCase().includes('aquarium')) score += 4;
  return score;
}

async function findImage(plantName) {
  const queries = [
    `${cleanName(plantName)} aquarium plant`,
    `${cleanName(plantName)} aquatic plant`,
    cleanName(plantName),
    baseScientificName(plantName),
  ];

  const seen = new Map();
  for (const query of queries) {
    const data = await requestJson(wikiSearchUrl(query));
    for (const page of Object.values(data.query?.pages ?? {})) {
      if (!isUsableImage(page)) continue;
      const key = page.title;
      const score = scorePage(page, plantName, query);
      if (!seen.has(key) || seen.get(key).score < score) {
        seen.set(key, { page, score, query });
      }
    }
  }

  const candidates = [...seen.values()].sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const credits = [];
  const failures = [];

  for (const category of catalog.plantCategories ?? []) {
    for (const plant of category.plants ?? []) {
      const slug = slugify(plant.name);
      const result = await findImage(plant.name);
      if (!result) {
        failures.push({ name: plant.name, category: category.id, reason: 'No open Commons image candidate found' });
        continue;
      }

      const info = result.page.imageinfo[0];
      const ext = info.mime === 'image/png' ? 'png' : info.mime === 'image/webp' ? 'webp' : 'jpg';
      const fileName = `${slug}.${ext}`;
      const filePath = path.join(outputDir, fileName);
      await wait(700);
      await download(info.thumburl, filePath);

      const relativePath = `assets/plants/${fileName}`;
      plant.image = relativePath;
      plant.images = [relativePath];
      credits.push({
        plant: plant.name,
        category: category.name,
        asset: relativePath,
        commonsTitle: result.page.title,
        source: info.descriptionurl,
        license: info.extmetadata?.LicenseShortName?.value ?? '',
        artist: info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').trim() ?? '',
        credit: info.extmetadata?.Credit?.value?.replace(/<[^>]*>/g, '').trim() ?? '',
        searchQuery: result.query,
      });
      console.log(`OK ${plant.name} -> ${relativePath}`);
    }
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(creditsPath, JSON.stringify({ generatedAt: new Date().toISOString(), credits, failures }, null, 2) + '\n');
  console.log(`Downloaded ${credits.length} plant images. Failures: ${failures.length}.`);
  if (failures.length) {
    console.log(JSON.stringify(failures.slice(0, 20), null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
