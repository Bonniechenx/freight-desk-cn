import type { FeeResult, ShipmentInput } from './freight';

export type WorkbookSheet = { sheet: string; data: unknown[][] };

export type WeightBand = { upTo: number; price: number };

export type ContinuedRule = {
  threshold: number;
  mode: 'first_continued' | 'waybill_continued';
  firstWeight: number;
  firstPrice: number;
  continuedStep: number;
  continuedPrice: number;
};

export type BaseRateRule = {
  destinations: string[];
  destinationPriority: number;
  dateLabel: string;
  dateStart: string | null;
  dateEnd: string | null;
  bands: WeightBand[];
  continued: ContinuedRule | null;
};

export type ExtraRateRule = {
  name: string;
  destinations: string[];
  excludesDestinations: boolean;
  bands: WeightBand[];
  continued: ContinuedRule | null;
};

export type ImportedWorkbookQuote = {
  quoteName: string;
  sourceFile: string;
  baseRules: BaseRateRule[];
  extraRules: ExtraRateRule[];
  periods: string[];
  bandLabels: string[];
  globalSettings: {
    doubleWeight: boolean;
    roundContinuedOnly: boolean;
    volumeFactor: number | null;
    totalRounding: string;
  };
  detectedSheets: string[];
  warnings: string[];
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const text = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value).trim();
  return '';
};

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDestination(value: string) {
  return value.replace(/[【】()（）]/g, '').replaceAll('[', '').replaceAll(']', '').replace(/壮族自治区|维吾尔自治区|回族自治区|自治区|特别行政区|省|市|区|县|\s/g, '');
}

function splitDestinations(value: unknown) {
  return text(value).replace(/^【排除】/, '').split(/[,，、;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function parseDateRange(value: unknown) {
  const label = text(value);
  const matches = label.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  return { label, start: matches?.[1] ?? null, end: matches?.[2] ?? null };
}

function parseWeight(value: unknown) {
  const matched = text(value).match(/(\d+(?:\.\d+)?)/);
  return matched ? Number(matched[1]) : null;
}

function parseContinuedRule(header: unknown[], subheader: unknown[], row: unknown[], index: number, fallbackThreshold: number): ContinuedRule | null {
  const firstLabel = text(subheader[index]);
  const continuedLabel = text(subheader[index + 1]);
  const firstPrice = number(row[index]);
  const continuedPrice = number(row[index + 1]);
  if (firstPrice === null || continuedPrice === null) return null;
  const threshold = parseWeight(header[index]) ?? fallbackThreshold;
  if (firstLabel.includes('面单费')) {
    return {
      threshold,
      mode: 'waybill_continued',
      firstWeight: 0,
      firstPrice,
      continuedStep: parseWeight(continuedLabel) ?? 1,
      continuedPrice,
    };
  }
  return {
    threshold,
    mode: 'first_continued',
    firstWeight: parseWeight(firstLabel) ?? 1,
    firstPrice,
    continuedStep: parseWeight(continuedLabel) ?? 1,
    continuedPrice,
  };
}

function parseModernBaseSheet(data: unknown[][]) {
  const rules: BaseRateRule[] = [];
  for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
    const header = data[rowIndex] ?? [];
    if (!text(header[0]).includes('目的地')) continue;
    const subheader = data[rowIndex + 1] ?? [];
    const overIndex = header.findIndex((cell, index) => index >= 2 && /以上/.test(text(cell)));
    const bandColumns = header.map((cell, index) => ({ index, limit: number(cell) })).filter((item) => item.index >= 2 && item.limit !== null && (overIndex < 0 || item.index < overIndex)) as Array<{ index: number; limit: number }>;
    const fallbackThreshold = bandColumns.at(-1)?.limit ?? 0;
    let dataIndex = rowIndex + 2;
    while (dataIndex < data.length && !text(data[dataIndex]?.[0]).includes('目的地')) {
      const row = data[dataIndex] ?? [];
      const destinationText = text(row[0]);
      if (destinationText) {
        const date = parseDateRange(row[1]);
        const bands = bandColumns.map(({ index, limit }) => ({ upTo: limit, price: number(row[index]) })).filter((item): item is WeightBand => item.price !== null);
        const continued = overIndex >= 0 ? parseContinuedRule(header, subheader, row, overIndex, fallbackThreshold) : null;
        if (bands.length || continued) {
          const destinationPriority = destinationText.includes('【') || destinationText.includes('[') ? 100 : 0;
          rules.push({ destinations: splitDestinations(destinationText), destinationPriority, dateLabel: date.label, dateStart: date.start, dateEnd: date.end, bands, continued });
        }
      }
      dataIndex += 1;
    }
    rowIndex = dataIndex - 1;
  }
  return rules;
}

function parseFormulaPrice(value: unknown): { firstPrice: number; continuedPrice: number } | null {
  const matched = text(value).match(/^\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*$/);
  return matched ? { firstPrice: Number(matched[1]), continuedPrice: Number(matched[2]) } : null;
}

function parseGroupedRateRow(header: unknown[], row: unknown[], startIndex: number) {
  const bands: WeightBand[] = [];
  let continued: ContinuedRule | null = null;
  let lastLimit = 0;
  for (let index = startIndex; index < header.length; index += 1) {
    if (!/^重量\d+/.test(text(header[index]))) continue;
    const limit = number(row[index]);
    const price = number(row[index + 1]);
    const formulaPrice = parseFormulaPrice(row[index + 1]);
    if (limit === null) continue;
    if (formulaPrice) {
      continued = { threshold: lastLimit, mode: 'first_continued', firstWeight: 1, firstPrice: formulaPrice.firstPrice, continuedStep: 1, continuedPrice: formulaPrice.continuedPrice };
    } else if (price !== null) {
      bands.push({ upTo: limit, price });
      lastLimit = limit;
    }
  }
  return { bands, continued };
}

function parseLegacyBaseSheet(data: unknown[][]) {
  if (!data.length) return [];
  const header = data[0] ?? [];
  return data.slice(1).map((row) => {
    const parsed = parseGroupedRateRow(header, row, 2);
    return { destinations: splitDestinations(row[0]), destinationPriority: 0, dateLabel: '', dateStart: null, dateEnd: null, ...parsed } satisfies BaseRateRule;
  }).filter((rule) => rule.destinations.length && (rule.bands.length || rule.continued));
}

function parseExtraSheet(data: unknown[][]) {
  if (data.length < 2) return [];
  const header = data[0] ?? [];
  return data.slice(1).map((row) => {
    const destinationText = text(row[1]);
    const parsed = parseGroupedRateRow(header, row, 3);
    return {
      name: text(row[0]) || '未命名加收费',
      destinations: splitDestinations(destinationText),
      excludesDestinations: destinationText.startsWith('【排除】'),
      ...parsed,
    } satisfies ExtraRateRule;
  }).filter((rule) => rule.destinations.length && (rule.bands.length || rule.continued));
}

function parseGlobalSettings(data: unknown[][]): ImportedWorkbookQuote['globalSettings'] {
  const headers = data[0] ?? [];
  const values = data[1] ?? [];
  const get = (name: string) => values[headers.findIndex((cell) => text(cell).includes(name))];
  return {
    doubleWeight: text(get('双重量模式')) === '开启',
    roundContinuedOnly: text(get('只对续重部分重量取整')) === '开启',
    volumeFactor: number(get('计抛系数')),
    totalRounding: text(get('合计费用的金额取整')) || '无需取整',
  };
}

export function parseWorkbookQuote(fileName: string, sheets: WorkbookSheet[]): ImportedWorkbookQuote {
  const sheetMap = new Map(sheets.map((sheet) => [sheet.sheet.trim(), sheet.data]));
  const modernBase = sheetMap.get('基础费用');
  const legacyBase = sheetMap.get('基础费用（旧）') ?? sheetMap.get('基础费用(旧)');
  const baseRules = modernBase ? parseModernBaseSheet(modernBase) : legacyBase ? parseLegacyBaseSheet(legacyBase) : [];
  if (!baseRules.length) throw new Error('未识别到有效的“基础费用”Sheet，请保留目的地、公斤段和价格表头');
  const extraRules = parseExtraSheet(sheetMap.get('加收费用') ?? []);
  const periods = [...new Set(baseRules.map((rule) => rule.dateLabel).filter(Boolean))];
  const bandLabels = [...new Set(baseRules.flatMap((rule) => rule.bands.map((band) => `${band.upTo}kg`)))];
  const warnings: string[] = [];
  for (const name of ['免收比率', '单量要求', '均重费用']) {
    if ((sheetMap.get(name)?.length ?? 0) > 1) warnings.push(`${name}需要整批账单统计，已识别但不参与单票试算`);
  }
  if (!extraRules.length && sheetMap.has('加收费用')) warnings.push('“加收费用”Sheet 当前没有填写可计算费率');
  return {
    quoteName: fileName.replace(/\.(xlsx|xls)$/i, ''),
    sourceFile: fileName,
    baseRules,
    extraRules,
    periods,
    bandLabels,
    globalSettings: parseGlobalSettings(sheetMap.get('全局设置') ?? []),
    detectedSheets: sheets.map((sheet) => sheet.sheet),
    warnings,
  };
}

function destinationSpecificity(ruleDestinations: string[], destination: string) {
  const target = normalizeDestination(destination);
  return Math.max(...ruleDestinations.map((place) => {
    const normalized = normalizeDestination(place);
    return normalized && target.includes(normalized) ? normalized.length : -1;
  }));
}

function dateMatches(rule: BaseRateRule, inputDate?: string) {
  if (!inputDate || (!rule.dateStart && !rule.dateEnd)) return true;
  return (!rule.dateStart || inputDate >= rule.dateStart) && (!rule.dateEnd || inputDate <= rule.dateEnd);
}

function evaluateRate(weight: number, bands: WeightBand[], continued: ContinuedRule | null) {
  const sorted = [...bands].sort((a, b) => a.upTo - b.upTo);
  const band = sorted.find((item) => weight <= item.upTo);
  if (band) return { fee: band.price, chargedWeight: band.upTo, explanation: `按不超过 ${band.upTo}kg 的阶梯价` };
  if (!continued) return null;
  if (continued.mode === 'waybill_continued') {
    const units = Math.ceil(weight / continued.continuedStep);
    return { fee: continued.firstPrice + units * continued.continuedPrice, chargedWeight: units * continued.continuedStep, explanation: `面单费 ¥${continued.firstPrice.toFixed(2)} + ${units} 个续重单位` };
  }
  const units = Math.max(0, Math.ceil((weight - continued.firstWeight) / continued.continuedStep));
  return { fee: continued.firstPrice + units * continued.continuedPrice, chargedWeight: continued.firstWeight + units * continued.continuedStep, explanation: `首重 ${continued.firstWeight}kg ¥${continued.firstPrice.toFixed(2)} + ${units} 个续重单位` };
}

function applyTotalRounding(value: number, mode: string) {
  if (mode.includes('向上取整')) return Math.ceil(value);
  if (mode.includes('向下取整')) return Math.floor(value);
  if (mode.includes('四舍五入') && !mode.includes('2位')) return Math.round(value);
  return round2(value);
}

export function calculateWorkbookFreight(input: ShipmentInput, quote: ImportedWorkbookQuote, prepaid = 0): FeeResult {
  const weight = Number(input.weight);
  if (!input.destination.trim() || !Number.isFinite(weight) || weight <= 0) {
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: '目的地为空或重量不是有效正数' };
  }
  const destinationMatches = quote.baseRules.map((rule) => {
    const matchedLength = destinationSpecificity(rule.destinations, input.destination);
    return { rule, specificity: matchedLength < 0 ? -1 : matchedLength + (rule.destinationPriority ?? 0) };
  }).filter((item) => item.specificity >= 0);
  const datedMatches = destinationMatches.filter(({ rule }) => dateMatches(rule, input.date));
  if (!datedMatches.length) {
    const reason = destinationMatches.length ? `发货日期 ${input.date || '未填写'} 未命中报价生效期` : `报价中没有匹配目的地“${input.destination}”`;
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: reason };
  }
  datedMatches.sort((a, b) => b.specificity - a.specificity || (b.rule.dateStart ?? '').localeCompare(a.rule.dateStart ?? ''));
  const baseRule = datedMatches[0].rule;
  const baseResult = evaluateRate(weight, baseRule.bands, baseRule.continued);
  if (!baseResult) {
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: `重量 ${weight}kg 超出已配置公斤段，且没有可用续重规则` };
  }
  const matchedExtras = quote.extraRules.map((rule) => {
    const matched = destinationSpecificity(rule.destinations, input.destination) >= 0;
    return { rule, applies: rule.excludesDestinations ? !matched : matched };
  }).filter((item) => item.applies).map(({ rule }) => ({ rule, result: evaluateRate(weight, rule.bands, rule.continued) })).filter((item) => item.result !== null) as Array<{ rule: ExtraRateRule; result: NonNullable<ReturnType<typeof evaluateRate>> }>;
  const baseFee = round2(baseResult.fee);
  const surcharge = round2(matchedExtras.reduce((sum, item) => sum + item.result.fee, 0));
  const total = applyTotalRounding(Math.max(0, baseFee + surcharge - prepaid), quote.globalSettings.totalRounding);
  const periodText = baseRule.dateLabel ? `命中 ${baseRule.dateLabel}` : '命中基础费用';
  const extraText = matchedExtras.length ? `；加收费：${matchedExtras.map((item) => item.rule.name).join('、')}` : '；无加收费';
  return {
    ...input,
    roundedWeight: baseResult.chargedWeight,
    baseFee,
    surcharge,
    prepaid,
    total,
    quoteName: quote.quoteName,
    status: 'ok',
    explanation: `${periodText}；${weight.toFixed(2)}kg ${baseResult.explanation}${extraText}`,
  };
}
