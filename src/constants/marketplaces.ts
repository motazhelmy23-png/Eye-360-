import { NormalizedProduct } from '../types/inventory';

export interface MarketplaceProvider {
  id: 'amazon' | 'noon' | 'jumia';
  name: string;
  nameAr: string;
  badgeColor: string;
  badgeBg: string;
  borderColor: string;
  hoverBg: string;
  textColor: string;
  searchUrlTemplate: string;
}

export const MARKETPLACE_PROVIDERS: MarketplaceProvider[] = [
  {
    id: 'amazon',
    name: 'Amazon Egypt',
    nameAr: 'بحث على Amazon',
    badgeColor: '#FF9900',
    badgeBg: '#FFF7ED',
    borderColor: '#FED7AA',
    hoverBg: '#FFEDD5',
    textColor: '#9A3412',
    searchUrlTemplate: 'https://www.amazon.eg/s?k={QUERY}',
  },
  {
    id: 'noon',
    name: 'noon Egypt',
    nameAr: 'بحث على noon',
    badgeColor: '#FEEE00',
    badgeBg: '#FEFCE8',
    borderColor: '#FEF08A',
    hoverBg: '#FEF9C3',
    textColor: '#854D0E',
    searchUrlTemplate: 'https://www.noon.com/egypt-en/search?q={QUERY}',
  },
  {
    id: 'jumia',
    name: 'Jumia Egypt',
    nameAr: 'بحث على Jumia',
    badgeColor: '#F68B1E',
    badgeBg: '#FFF8F1',
    borderColor: '#FFEDD5',
    hoverBg: '#FFE4D6',
    textColor: '#9A3412',
    searchUrlTemplate: 'https://www.jumia.com.eg/catalog/?q={QUERY}',
  },
];

/**
 * Constructs a clean, deduplicated search query string from product metadata
 * Strictly excludes internal itemCode.
 */
export function buildExternalProductSearchQuery(product: Partial<NormalizedProduct> | null | undefined): string {
  if (!product) return '';

  const tokens: string[] = [];

  // Add brand
  if (product.brand && product.brand.trim()) {
    tokens.push(product.brand.trim());
  }

  // Add name
  if (product.name && product.name.trim()) {
    tokens.push(product.name.trim());
  }

  // Add modelCode if distinct and not already in name
  if (product.modelCode && product.modelCode.trim()) {
    const model = product.modelCode.trim();
    const existingCombined = tokens.join(' ').toLowerCase();
    if (!existingCombined.includes(model.toLowerCase())) {
      tokens.push(model);
    }
  }

  if (tokens.length === 0) return '';

  // Clean, split by whitespace, and deduplicate words case-insensitively
  const rawString = tokens.join(' ');
  const words = rawString.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const uniqueWords: string[] = [];

  for (const w of words) {
    const lower = w.toLowerCase();
    // Exclude itemCode if accidentally present
    if (product.itemCode && lower === product.itemCode.toLowerCase()) {
      continue;
    }
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueWords.push(w);
    }
  }

  return uniqueWords.join(' ');
}

/**
 * Builds the direct external search URL for a given marketplace provider
 */
export function getMarketplaceSearchUrl(provider: MarketplaceProvider, product: NormalizedProduct): string | null {
  const query = buildExternalProductSearchQuery(product);
  if (!query.trim()) return null;

  const encodedQuery = encodeURIComponent(query.trim());
  return provider.searchUrlTemplate.replace('{QUERY}', encodedQuery);
}
