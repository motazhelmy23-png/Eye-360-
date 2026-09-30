import { NormalizedProduct } from '../types/inventory';

export interface ProductSpecs {
  ramGb?: number;
  storageGb?: number;
  wattage?: number;
  screenInches?: number;
  volumeLiters?: number;
  weightKg?: number;
  voltage?: number;
  horsepower?: number;
  btu?: number;
}

export interface RecommendationScoreBreakdown {
  categoryScore: number;
  specScore: number;
  priceScore: number;
  textScore: number;
  brandBonus: number;
  stockBonus: number;
  totalScore: number;
  reasons: string[];
}

export interface ProductRecommendation {
  product: NormalizedProduct;
  score: number;
  reasons: string[];
  specs: ProductSpecs;
  scoreBreakdown?: RecommendationScoreBreakdown;
}

/**
 * Normalizes text for comparison (Arabic + English)
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\w\s\d\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts key technical specifications deterministically from name, category, and model
 */
export function extractProductSpecs(product: Partial<NormalizedProduct>): ProductSpecs {
  const text = `${product.name || ''} ${product.modelCode || ''} ${product.category || ''}`;
  const specs: ProductSpecs = {};

  // 1. RAM: 8GB RAM, 8 GB RAM, RAM 8GB, رام 8 جيجا, 8 جيجا رام, 8GB
  const ramMatch = text.match(/(?:(?:ram|رام)\s*[:=]?\s*(\d+)\s*(?:gb|g|جيجا)?)|(?:(\d+)\s*(?:gb|g|جيجا)\s*(?:ram|رام))/i);
  if (ramMatch) {
    const val = parseInt(ramMatch[1] || ramMatch[2], 10);
    if (!isNaN(val) && val >= 1 && val <= 128) {
      specs.ramGb = val;
    }
  }

  // 2. Storage / ROM: 128GB, 256GB, 512GB, 1TB, ROM 256GB, مساحة 256 جيجا, ذاكرة 128
  const tbMatch = text.match(/(?:(\d+)\s*(?:tb|تيرا))/i);
  if (tbMatch) {
    const tbVal = parseInt(tbMatch[1], 10);
    if (!isNaN(tbVal) && tbVal >= 1 && tbVal <= 8) {
      specs.storageGb = tbVal * 1024;
    }
  } else {
    const storageMatch = text.match(/(?:(?:rom|ذاكره|ذاكرة|مساحه|مساحة)\s*[:=]?\s*(\d+)\s*(?:gb|g|جيجا)?)|(?:(\d+)\s*(?:gb|جيجا)\s*(?:rom|storage|مساحه|ذاكره)?)/i);
    if (storageMatch) {
      const val = parseInt(storageMatch[1] || storageMatch[2], 10);
      if (!isNaN(val) && (val === 16 || val === 32 || val === 64 || val === 128 || val === 256 || val === 512 || val === 1024)) {
        // Ensure it is not the same as RAM if RAM was just extracted as same number
        if (!specs.ramGb || val !== specs.ramGb || val >= 32) {
          specs.storageGb = val;
        }
      }
    }
  }

  // 3. Power / Wattage: 1200W, 1600 W, 2000 Watt, 2000 وات, 2000 واط
  const wattMatch = text.match(/(\d{2,5})\s*(?:w|watt|وات|واط)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (wattMatch) {
    const val = parseInt(wattMatch[1], 10);
    if (!isNaN(val) && val >= 100 && val <= 15000) {
      specs.wattage = val;
    }
  }

  // 4. Screen Size: 55 inch, 55", 55 بوصة, 55-inch, 65 بوصه
  const screenMatch = text.match(/(\d{2}(?:\.\d)?)\s*(?:inch|in|"|''|بوصه|بوصة)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (screenMatch) {
    const val = parseFloat(screenMatch[1]);
    if (!isNaN(val) && val >= 10 && val <= 120) {
      specs.screenInches = val;
    }
  }

  // 5. Volume / Capacity in Liters: 1.5L, 2 L, 20 لتر, 1.5 لتر
  const literMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|liters|لتر|لترات)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (literMatch) {
    const val = parseFloat(literMatch[1]);
    if (!isNaN(val) && val >= 0.2 && val <= 2000) {
      specs.volumeLiters = val;
    }
  }

  // 6. Weight in KG: 7kg, 10 KG, 10 كجم, 7 كيلو, 8 كغم
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|كجم|كيلو|كغم)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1]);
    if (!isNaN(val) && val >= 0.5 && val <= 500) {
      specs.weightKg = val;
    }
  }

  // 7. Voltage: 12V, 18V, 220V, 220 فولت, 110v
  const voltMatch = text.match(/(\d{1,3})\s*(?:v|volt|volts|فولت)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (voltMatch) {
    const val = parseInt(voltMatch[1], 10);
    if (!isNaN(val) && (val === 12 || val === 18 || val === 20 || val === 24 || val === 36 || val === 110 || val === 220 || val === 240)) {
      specs.voltage = val;
    }
  }

  // 8. Horsepower: 1.5 HP, 2.25 حصان, 3 حصان, 1.5hp
  const hpMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hp|حصان)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (hpMatch) {
    const val = parseFloat(hpMatch[1]);
    if (!isNaN(val) && val >= 0.5 && val <= 50) {
      specs.horsepower = val;
    }
  }

  // 9. BTU: 12000 BTU, 18000 و.ح.ب, 18000 وحدة
  const btuMatch = text.match(/(\d{4,6})\s*(?:btu|وحدة|و\.ح\.ب)(?:[\s,.\-؛!]|$|[^\w\u0600-\u06FF])/i);
  if (btuMatch) {
    const val = parseInt(btuMatch[1], 10);
    if (!isNaN(val) && val >= 5000 && val <= 100000) {
      specs.btu = val;
    }
  }

  return specs;
}

/**
 * Calculates continuous proximity score between 0 and 1
 */
function calculateNumericProximity(valA: number, valB: number, maxRelativeTolerance = 0.3): number {
  if (valA === valB) return 1;
  const maxVal = Math.max(Math.abs(valA), Math.abs(valB));
  if (maxVal === 0) return 1;
  const diff = Math.abs(valA - valB);
  const ratio = diff / maxVal;
  if (ratio >= maxRelativeTolerance) return 0;
  return Math.max(0, 1 - ratio / maxRelativeTolerance);
}

/**
 * Compares two sets of specs and returns a score (0 to 45) and matched reason tags
 */
export function compareSpecs(targetSpecs: ProductSpecs, candidateSpecs: ProductSpecs): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // RAM comparison (Discrete)
  if (targetSpecs.ramGb !== undefined && candidateSpecs.ramGb !== undefined) {
    if (targetSpecs.ramGb === candidateSpecs.ramGb) {
      score += 45;
      reasons.push(`رام ${targetSpecs.ramGb} جيجا`);
    } else {
      const diff = Math.abs(targetSpecs.ramGb - candidateSpecs.ramGb);
      if (diff <= 2) {
        score += 25;
        reasons.push(`رام قريب (${candidateSpecs.ramGb} جيجا)`);
      } else if (diff <= 4) {
        score += 10;
      }
    }
  }

  // Wattage comparison (Continuous)
  if (targetSpecs.wattage !== undefined && candidateSpecs.wattage !== undefined) {
    const prox = calculateNumericProximity(targetSpecs.wattage, candidateSpecs.wattage, 0.4);
    if (targetSpecs.wattage === candidateSpecs.wattage) {
      score += 45;
      reasons.push(`${targetSpecs.wattage} وات`);
    } else if (prox > 0.6) {
      score += Math.round(prox * 40);
      reasons.push(`قدرة قريبة (${candidateSpecs.wattage}W)`);
    } else if (prox > 0) {
      score += Math.round(prox * 25);
    }
  }

  // Screen Size comparison
  if (targetSpecs.screenInches !== undefined && candidateSpecs.screenInches !== undefined) {
    if (targetSpecs.screenInches === candidateSpecs.screenInches) {
      score += 45;
      reasons.push(`شاشة ${targetSpecs.screenInches} بوصة`);
    } else {
      const diff = Math.abs(targetSpecs.screenInches - candidateSpecs.screenInches);
      if (diff <= 5) {
        score += 25;
        reasons.push(`شاشة ${candidateSpecs.screenInches} بوصة`);
      }
    }
  }

  // Storage comparison
  if (targetSpecs.storageGb !== undefined && candidateSpecs.storageGb !== undefined) {
    if (targetSpecs.storageGb === candidateSpecs.storageGb) {
      score += 35;
      const strgDisplay = targetSpecs.storageGb >= 1024 ? `${targetSpecs.storageGb / 1024}TB` : `${targetSpecs.storageGb}GB`;
      reasons.push(`مساحة ${strgDisplay}`);
    } else {
      const ratio = Math.min(targetSpecs.storageGb, candidateSpecs.storageGb) / Math.max(targetSpecs.storageGb, candidateSpecs.storageGb);
      if (ratio >= 0.5) {
        score += 18;
      }
    }
  }

  // Volume Liters comparison
  if (targetSpecs.volumeLiters !== undefined && candidateSpecs.volumeLiters !== undefined) {
    const prox = calculateNumericProximity(targetSpecs.volumeLiters, candidateSpecs.volumeLiters, 0.35);
    if (targetSpecs.volumeLiters === candidateSpecs.volumeLiters) {
      score += 40;
      reasons.push(`سعة ${targetSpecs.volumeLiters} لتر`);
    } else if (prox > 0) {
      score += Math.round(prox * 30);
    }
  }

  // Weight KG comparison
  if (targetSpecs.weightKg !== undefined && candidateSpecs.weightKg !== undefined) {
    const prox = calculateNumericProximity(targetSpecs.weightKg, candidateSpecs.weightKg, 0.35);
    if (targetSpecs.weightKg === candidateSpecs.weightKg) {
      score += 40;
      reasons.push(`حجم ${targetSpecs.weightKg} كجم`);
    } else if (prox > 0) {
      score += Math.round(prox * 30);
    }
  }

  // Horsepower comparison
  if (targetSpecs.horsepower !== undefined && candidateSpecs.horsepower !== undefined) {
    if (targetSpecs.horsepower === candidateSpecs.horsepower) {
      score += 45;
      reasons.push(`${targetSpecs.horsepower} حصان`);
    } else if (Math.abs(targetSpecs.horsepower - candidateSpecs.horsepower) <= 1) {
      score += 25;
    }
  }

  // BTU comparison
  if (targetSpecs.btu !== undefined && candidateSpecs.btu !== undefined) {
    const prox = calculateNumericProximity(targetSpecs.btu, candidateSpecs.btu, 0.3);
    if (prox > 0) {
      score += Math.round(prox * 45);
      if (targetSpecs.btu === candidateSpecs.btu) {
        reasons.push(`${targetSpecs.btu} BTU`);
      }
    }
  }

  // Cap spec score at 50
  return {
    score: Math.min(50, score),
    reasons,
  };
}

/**
 * Computes Jaccard word token similarity between two strings
 */
function computeTokenOverlap(strA: string, strB: string): number {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);
  if (!normA || !normB) return 0;

  const setA = new Set(normA.split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(normB.split(/\s+/).filter(w => w.length > 2));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((w) => {
    if (setB.has(w)) intersection++;
  });

  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Finds top 3 similar products locally from catalog
 */
export function findSimilarProducts(
  targetProduct: NormalizedProduct,
  allProducts: NormalizedProduct[],
  maxResults = 3
): ProductRecommendation[] {
  if (!targetProduct || !allProducts || allProducts.length === 0) {
    return [];
  }

  const targetSpecs = extractProductSpecs(targetProduct);
  const targetCategoryNorm = normalizeText(targetProduct.category);
  const targetBrandNorm = normalizeText(targetProduct.brand);
  const targetPrice = typeof targetProduct.salePrice === 'number' && targetProduct.salePrice > 0 ? targetProduct.salePrice : 0;
  const targetName = targetProduct.name || '';

  // 1. Filter out self strictly by itemCode
  const candidatePool = allProducts.filter(p => p.itemCode !== targetProduct.itemCode && p.active !== false);

  if (candidatePool.length === 0) return [];

  // 2. Score candidates
  const scoredCandidates: ProductRecommendation[] = [];

  for (const candidate of candidatePool) {
    const reasons: string[] = [];
    let categoryScore = 0;

    const candCategoryNorm = normalizeText(candidate.category);
    const hasCategory = Boolean(targetCategoryNorm && candCategoryNorm);

    if (hasCategory) {
      if (targetCategoryNorm === candCategoryNorm) {
        categoryScore = 40; // Dominant match
      } else if (targetCategoryNorm.includes(candCategoryNorm) || candCategoryNorm.includes(targetCategoryNorm)) {
        categoryScore = 25;
      } else {
        // Different category: If both have categories and they are completely different, skip unless strong name overlap
        const tokenSim = computeTokenOverlap(targetName, candidate.name || '');
        if (tokenSim < 0.4) {
          continue; // Enforce strict category barrier
        }
        categoryScore = 5;
      }
    } else {
      // Fallback when category is missing: match using name token overlap
      const tokenSim = computeTokenOverlap(targetName, candidate.name || '');
      categoryScore = Math.round(tokenSim * 30);
      if (categoryScore < 5) continue;
    }

    // Spec Comparison (40-50%)
    const candidateSpecs = extractProductSpecs(candidate);
    const specResult = compareSpecs(targetSpecs, candidateSpecs);
    const specScore = specResult.score;
    reasons.push(...specResult.reasons);

    // Price Proximity (25-30%)
    let priceScore = 0;
    const candPrice = typeof candidate.salePrice === 'number' && candidate.salePrice > 0 ? candidate.salePrice : 0;
    if (targetPrice > 0 && candPrice > 0) {
      const maxP = Math.max(targetPrice, candPrice);
      const diffP = Math.abs(targetPrice - candPrice);
      const ratio = diffP / maxP;
      if (ratio <= 0.4) {
        // Close price
        priceScore = Math.round((1 - ratio / 0.4) * 25);
        if (priceScore >= 18 && reasons.length < 2) {
          reasons.push('السعر قريب');
        }
      }
    }

    // Name Token Similarity (15-20%)
    const nameOverlap = computeTokenOverlap(targetName, candidate.name || '');
    const textScore = Math.round(nameOverlap * 15);

    // Brand bonus
    let brandBonus = 0;
    const candBrandNorm = normalizeText(candidate.brand);
    if (targetBrandNorm && candBrandNorm && targetBrandNorm === candBrandNorm) {
      brandBonus = 6;
      if (reasons.length === 0) {
        reasons.push(`ماركة ${candidate.brand}`);
      }
    }

    // Stock availability bonus (tie-breaker)
    const stockBonus = candidate.totalStock > 0 ? 3 : 0;

    // Total Score
    const totalScore = categoryScore + specScore + priceScore + textScore + brandBonus + stockBonus;

    if (totalScore >= 30) {
      // Default fallback reason if empty
      if (reasons.length === 0) {
        if (candidate.category) {
          reasons.push(`فئة ${candidate.category}`);
        } else {
          reasons.push('صنف مماثل');
        }
      }

      scoredCandidates.push({
        product: candidate,
        score: totalScore,
        reasons: reasons.slice(0, 2),
        specs: candidateSpecs,
        scoreBreakdown: {
          categoryScore,
          specScore,
          priceScore,
          textScore,
          brandBonus,
          stockBonus,
          totalScore,
          reasons: reasons.slice(0, 2),
        },
      });
    }
  }

  // Sort descending by totalScore, with stock as secondary tie-breaker
  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.product.totalStock || 0) - (a.product.totalStock || 0);
  });

  return scoredCandidates.slice(0, maxResults);
}
