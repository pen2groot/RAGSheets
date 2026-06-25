function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function number(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolean(value) {
  return value === true || value === 1 || ['true', 'yes', '1'].includes(text(value).toLowerCase());
}

export function buildCatalogFromTables(productRows, profileRows, mediaRows) {
  const profiles = new Map();
  for (const row of profileRows.sort((a, b) => (number(a['Display Order']) ?? 0) - (number(b['Display Order']) ?? 0))) {
    const id = text(row['Product ID']);
    if (!id || !text(row.Label)) continue;
    const entries = profiles.get(id) ?? [];
    entries.push({ label: text(row.Label), value: text(row.Value) });
    profiles.set(id, entries);
  }

  const media = new Map();
  for (const row of mediaRows.sort((a, b) => (number(a['Display Order']) ?? 0) - (number(b['Display Order']) ?? 0))) {
    const id = text(row['Product ID']);
    const url = text(row['URL or Asset Path']);
    const type = text(row['Media Type']).toLowerCase();
    if (!id || !url || !['image', 'video'].includes(type)) continue;
    const entry = media.get(id) ?? { images: [], videos: [] };
    entry[type === 'video' ? 'videos' : 'images'].push(url);
    media.set(id, entry);
  }

  const fishCategories = new Map();
  const plantCategories = new Map();
  for (const row of productRows) {
    const type = text(row.Type).toLowerCase();
    const id = text(row['Product ID']);
    const categoryId = text(row['Category ID']);
    const categoryName = text(row['Category Name']);
    if (!id || !categoryId || !categoryName || !['fish', 'plant'].includes(type)) continue;

    const prices = {};
    const each = number(row['Price Each']);
    const pair = number(row['Price Pair']);
    const bundle6 = number(row['Price Bundle 6']);
    if (each !== undefined) prices.each = each;
    if (pair !== undefined) prices.pair = pair;
    if (bundle6 !== undefined) prices.bundle6 = bundle6;

    const item = {
      id,
      name: text(row['Product Name']),
      image: text(row['Primary Image']),
      prices,
      min: number(row['Min Qty']),
      max: number(row['Max Qty']),
      status: text(row.Status) || 'AV',
      visible: boolean(row.Visible),
    };
    if (text(row.Size)) item.size = text(row.Size);
    if (text(row['Price Unit'])) item.priceUnit = text(row['Price Unit']);
    if (profiles.has(id)) item.profile = profiles.get(id);
    const itemMedia = media.get(id);
    if (itemMedia?.images.length) item.images = itemMedia.images;
    if (itemMedia?.videos.length) item.videos = itemMedia.videos;
    const discountValue = number(row['Discount Value']);
    if (text(row['Discount Type']) && discountValue !== undefined) {
      item.discount = {
        type: text(row['Discount Type']),
        value: discountValue,
        ...(text(row['Discount Label']) ? { label: text(row['Discount Label']) } : {}),
      };
    }

    const target = type === 'fish' ? fishCategories : plantCategories;
    const childKey = type === 'fish' ? 'fish' : 'plants';
    const category = target.get(categoryId) ?? { id: categoryId, name: categoryName, [childKey]: [] };
    category[childKey].push(item);
    target.set(categoryId, category);
  }

  return {
    categories: [...fishCategories.values()],
    plantCategories: [...plantCategories.values()],
  };
}
