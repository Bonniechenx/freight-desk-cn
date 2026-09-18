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
  conditionLabel: string;
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
  destinationPriority?: number;
  conditionLabel?: string;
  dateLabel?: string;
  dateStart?: string | null;
  dateEnd?: string | null;
  bands: WeightBand[];
  continued: ContinuedRule | null;
};

export type ImportedWorkbookQuote = {
  quoteName: string;
  sourceFile: string;
  folderId?: string;
  baseRules: BaseRateRule[];
  extraRules: ExtraRateRule[];
  periods: string[];
  bandLabels: string[];
  conditionLabels: string[];
  globalSettings: {
    doubleWeight: boolean;
    roundContinuedOnly: boolean;
    volumeFactor: number | null;
    totalRounding: string;
  };
  detectedSheets: string[];
  warnings: string[];
  importedAt?: string;
  version?: number;
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
  return value
    .replace(/^(省|市|区|县|province|city|district)\s*[:：]/i, '')
    .replace(/[【】()（）]/g, '').replaceAll('[', '').replaceAll(']', '')
    .replace(/壮族自治区|维吾尔自治区|回族自治区|自治区|特别行政区|省|市|区|县|[\s+>/|]/g, '');
}

function destinationLevel(value: string) {
  const target = value.trim();
  if (/^(区|县|district)\s*[:：]/i.test(target) || target.endsWith('区') || target.endsWith('县') || target.endsWith('旗')) return 300;
  if (/^(市|city)\s*[:：]/i.test(target) || /[【[]/.test(target) || target.endsWith('市') || target.endsWith('州') || target.endsWith('盟')) return 200;
  if (/^(省|province)\s*[:：]/i.test(target) || target.endsWith('省') || target.endsWith('自治区') || target.endsWith('特别行政区')) return 100;
  return 0;
}

function splitDestinations(value: unknown) {
  return text(value).replace(/^【排除】/, '').split(/[,，、;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function parseDateRange(value: unknown) {
  const label = text(value);
  if (value instanceof Date) {
    const date = value.toISOString().slice(0, 10);
    return { label: date, start: date, end: null };
  }
  const dates = [...label.matchAll(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/g)].map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
  return { label, start: dates[0] ?? null, end: dates[1] ?? null };
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
    const destinationIndex = header.findIndex((cell) => /目的地|收件地区|收货地区/.test(text(cell)));
    if (destinationIndex < 0) continue;
    const subheader = data[rowIndex + 1] ?? [];
    const conditionIndex = header.findIndex((cell) => /附加条件|物流公司|计费渠道|报价条件/.test(text(cell)));
    const dateRangeIndex = header.findIndex((cell) => /生效日期|生效时间|有效期/.test(text(cell)));
    const dateStartIndex = header.findIndex((cell) => /生效开始|开始日期/.test(text(cell)));
    const dateEndIndex = header.findIndex((cell) => /生效结束|结束日期|失效日期/.test(text(cell)));
    const overIndex = header.findIndex((cell) => /以上/.test(text(cell)));
    const reserved = new Set([destinationIndex, conditionIndex, dateRangeIndex, dateStartIndex, dateEndIndex].filter((index) => index >= 0));
    const bandColumns = header.map((cell, index) => ({ index, limit: parseWeight(cell) })).filter((item) => !reserved.has(item.index) && item.limit !== null && (overIndex < 0 || item.index < overIndex)) as Array<{ index: number; limit: number }>;
    const fallbackThreshold = bandColumns.at(-1)?.limit ?? 0;
    let dataIndex = rowIndex + 2;
    while (dataIndex < data.length && !/目的地|收件地区|收货地区/.test(text(data[dataIndex]?.[destinationIndex]))) {
      const row = data[dataIndex] ?? [];
      const destinationText = text(row[destinationIndex]);
      if (destinationText) {
        const rangeDate = dateRangeIndex >= 0 ? parseDateRange(row[dateRangeIndex]) : { label: '', start: null, end: null };
        const startDate = dateStartIndex >= 0 ? parseDateRange(row[dateStartIndex]).start : null;
        const endDate = dateEndIndex >= 0 ? parseDateRange(row[dateEndIndex]).start : null;
        const date = { label: rangeDate.label || [startDate, endDate].filter(Boolean).join('至'), start: startDate ?? rangeDate.start, end: endDate ?? rangeDate.end };
        const bands = bandColumns.map(({ index, limit }) => ({ upTo: limit, price: number(row[index]) })).filter((item): item is WeightBand => item.price !== null);
        const continued = overIndex >= 0 ? parseContinuedRule(header, subheader, row, overIndex, fallbackThreshold) : null;
        if (bands.length || continued) {
          const destinations = splitDestinations(destinationText);
          const destinationPriority = Math.max(100, ...destinations.map(destinationLevel));
          rules.push({ destinations, destinationPriority, conditionLabel: conditionIndex >= 0 ? text(row[conditionIndex]) : '', dateLabel: date.label, dateStart: date.start, dateEnd: date.end, bands, continued });
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
    return { destinations: splitDestinations(row[0]), destinationPriority: 100, conditionLabel: '', dateLabel: '', dateStart: null, dateEnd: null, ...parsed } satisfies BaseRateRule;
  }).filter((rule) => rule.destinations.length && (rule.bands.length || rule.continued));
}

function parseExtraSheet(data: unknown[][]) {
  if (data.length < 2) return [];
  const header = data[0] ?? [];
  const nameIndex = header.findIndex((cell) => /收费名称|费用名称/.test(text(cell)));
  const destinationIndex = header.findIndex((cell) => /目的地|收件地区|收货地区/.test(text(cell)));
  const conditionIndex = header.findIndex((cell) => /附加条件|物流公司|计费渠道|报价条件/.test(text(cell)));
  const dateIndex = header.findIndex((cell) => /生效日期|生效时间|有效期/.test(text(cell)));
  const firstWeightIndex = header.findIndex((cell) => /^重量\d+/.test(text(cell)));
  return data.slice(1).map((row) => {
    const destinationText = destinationIndex >= 0 ? text(row[destinationIndex]) : '';
    const date = dateIndex >= 0 ? parseDateRange(row[dateIndex]) : { label: '', start: null, end: null };
    const destinations = splitDestinations(destinationText).filter((item) => !/全部/.test(item));
    const parsed = parseGroupedRateRow(header, row, firstWeightIndex >= 0 ? firstWeightIndex : 0);
    return {
      name: text(row[nameIndex >= 0 ? nameIndex : 0]) || '未命名加收费',
      destinations,
      excludesDestinations: destinationText.startsWith('【排除】'),
      destinationPriority: destinations.length ? Math.max(100, ...destinations.map(destinationLevel)) : 0,
      conditionLabel: conditionIndex >= 0 ? text(row[conditionIndex]) : '',
      dateLabel: date.label,
      dateStart: date.start,
      dateEnd: date.end,
      ...parsed,
    } satisfies ExtraRateRule;
  }).filter((rule) => (rule.bands.length || rule.continued));
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
  const periods = [...new Set([...baseRules.map((rule) => rule.dateLabel), ...extraRules.map((rule) => rule.dateLabel ?? '')].filter(Boolean))];
  const bandLabels = [...new Set(baseRules.flatMap((rule) => rule.bands.map((band) => `${band.upTo}kg`)))];
  const conditionLabels = [...new Set([...baseRules.map((rule) => rule.conditionLabel), ...extraRules.map((rule) => rule.conditionLabel ?? '')].filter(Boolean))];
  const warnings: string[] = [];
  for (const name of ['免收比率', '单量要求', '均重费用']) {
    if ((sheetMap.get(name)?.length ?? 0) > 1) warnings.push(`${name}需要整批账单统计，已识别但不参与单票试算`);
  }
  if (!extraRules.length && sheetMap.has('加收费用')) warnings.push('“加收费用”Sheet 当前没有填写可计算费率');
  const invalidDateRules = [...baseRules, ...extraRules].filter((rule) => rule.dateStart && rule.dateEnd && rule.dateStart > rule.dateEnd).length;
  if (invalidDateRules) warnings.push(`${invalidDateRules} 条规则的生效开始日期晚于结束日期，请修正后再用于正式核算`);
  const incompleteWeightRules = baseRules.filter((rule) => !rule.continued && !rule.bands.length).length;
  if (incompleteWeightRules) warnings.push(`${incompleteWeightRules} 条基础规则缺少可计算公斤段`);
  const duplicateRuleCount = baseRules.length - new Set(baseRules.map((rule) => `${rule.destinations.join('|')}::${rule.conditionLabel}::${rule.dateStart ?? ''}::${rule.dateEnd ?? ''}::${rule.bands.map((band) => `${band.upTo}:${band.price}`).join('|')}`)).size;
  if (duplicateRuleCount) warnings.push(`发现 ${duplicateRuleCount} 条完全重复的基础费用规则`);
  return {
    quoteName: fileName.replace(/\.(xlsx|xls)$/i, ''),
    sourceFile: fileName,
    baseRules,
    extraRules,
    periods,
    bandLabels,
    conditionLabels,
    globalSettings: parseGlobalSettings(sheetMap.get('全局设置') ?? []),
    detectedSheets: sheets.map((sheet) => sheet.sheet),
    warnings,
    importedAt: new Date().toISOString(),
    version: 1,
  };
}

function destinationSpecificity(ruleDestinations: string[], destination: string, rulePriority = 0) {
  const target = normalizeDestination(destination);
  const parts = destination.split(/\s*(?:\/|>|\||\+)\s*/).map((part) => part.trim()).filter(Boolean).map((part) => ({ normalized: normalizeDestination(part), level: destinationLevel(part) }));
  return Math.max(...ruleDestinations.map((place) => {
    const normalized = normalizeDestination(place);
    const level = destinationLevel(place) || rulePriority || 100;
    if (!normalized) return -1;
    if (level === 100) {
      const explicitProvinceParts = parts.filter((part) => part.level === 100);
      const provinceParts = explicitProvinceParts.length ? explicitProvinceParts : parts[0]?.level < 200 ? [parts[0]] : [];
      const matched = parts.length > 1 ? provinceParts.some((part) => part.normalized === normalized || part.normalized.startsWith(normalized)) : target.startsWith(normalized);
      return matched ? 100 + normalized.length : -1;
    }
    if (parts.length > 1 && level >= 200) {
      const matched = parts.some((part) => part.level === level && (part.normalized === normalized || part.normalized.includes(normalized)));
      return matched ? level + normalized.length : -1;
    }
    return target.includes(normalized) ? level + normalized.length : -1;
  }));
}

function dateMatches(rule: { dateStart?: string | null; dateEnd?: string | null }, inputDate?: string) {
  if (!rule.dateStart && !rule.dateEnd) return true;
  if (!inputDate) return false;
  return (!rule.dateStart || inputDate >= rule.dateStart) && (!rule.dateEnd || inputDate <= rule.dateEnd);
}

function conditionSpecificity(ruleCondition: string, inputCondition?: string) {
  if (!ruleCondition) return 0;
  if (!inputCondition?.trim()) return -1;
  const normalize = (value: string) => value.toLowerCase().replace(/[\s_—–,，、;；/\\|()（）【】-]+/g, '').replaceAll('[', '').replaceAll(']', '');
  const rule = normalize(ruleCondition);
  const input = normalize(inputCondition);
  if (!rule || !input) return -1;
  if (rule === input) return 200 + rule.length;
  if (rule.includes(input) || input.includes(rule)) return 100 + Math.min(rule.length, input.length);
  return -1;
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
    const matchedLength = destinationSpecificity(rule.destinations, input.destination, rule.destinationPriority ?? 0);
    return { rule, specificity: matchedLength < 0 ? -1 : matchedLength + (rule.destinationPriority ?? 0) };
  }).filter((item) => item.specificity >= 0);
  const datedMatches = destinationMatches.filter(({ rule }) => dateMatches(rule, input.date));
  if (!datedMatches.length) {
    const reason = destinationMatches.length ? `发货日期 ${input.date || '未填写'} 未命中报价生效期` : `报价中没有匹配目的地“${input.destination}”`;
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: reason };
  }
  const conditionedMatches = datedMatches.map((item) => ({ ...item, conditionSpecificity: conditionSpecificity(item.rule.conditionLabel ?? '', input.rateCondition) })).filter((item) => item.conditionSpecificity >= 0);
  if (!conditionedMatches.length) {
    const available = [...new Set(datedMatches.map((item) => item.rule.conditionLabel).filter(Boolean))].slice(0, 5);
    const reason = input.rateCondition?.trim() ? `报价中没有匹配条件“${input.rateCondition}”` : `该目的地需要填写物流公司或报价条件${available.length ? `，例如：${available.join('、')}` : ''}`;
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: reason };
  }
  conditionedMatches.sort((a, b) => b.conditionSpecificity - a.conditionSpecificity || b.specificity - a.specificity || (b.rule.dateStart ?? '').localeCompare(a.rule.dateStart ?? ''));
  const top = conditionedMatches[0];
  const tied = conditionedMatches.find((item, index) => index > 0 && item.conditionSpecificity === top.conditionSpecificity && item.specificity === top.specificity && item.rule.conditionLabel !== top.rule.conditionLabel);
  if (tied && top.conditionSpecificity > 0) {
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: `报价条件“${input.rateCondition}”同时命中“${top.rule.conditionLabel}”和“${tied.rule.conditionLabel}”，请填写更完整的物流公司或渠道名称` };
  }
  const baseRule = top.rule;
  const baseResult = evaluateRate(weight, baseRule.bands, baseRule.continued);
  if (!baseResult) {
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: quote.quoteName, status: 'error', explanation: `重量 ${weight}kg 超出已配置公斤段，且没有可用续重规则` };
  }
  const matchedExtras = quote.extraRules.map((rule) => {
    const destinationMatched = rule.destinations.length === 0 || destinationSpecificity(rule.destinations, input.destination, rule.destinationPriority ?? 0) >= 0;
    const destinationApplies = rule.excludesDestinations ? !destinationMatched : destinationMatched;
    const conditionApplies = conditionSpecificity(rule.conditionLabel ?? '', input.rateCondition) >= 0;
    return { rule, applies: destinationApplies && conditionApplies && dateMatches(rule, input.date) };
  }).filter((item) => item.applies).map(({ rule }) => ({ rule, result: evaluateRate(weight, rule.bands, rule.continued) })).filter((item) => item.result !== null) as Array<{ rule: ExtraRateRule; result: NonNullable<ReturnType<typeof evaluateRate>> }>;
  const baseFee = round2(baseResult.fee);
  const surchargeDetails = matchedExtras.reduce<Record<string, number>>((details, item) => {
    details[item.rule.name] = round2((details[item.rule.name] ?? 0) + item.result.fee);
    return details;
  }, {});
  const surcharge = round2(Object.values(surchargeDetails).reduce((sum, fee) => sum + fee, 0));
  const total = applyTotalRounding(Math.max(0, baseFee + surcharge - prepaid), quote.globalSettings.totalRounding);
  const periodText = baseRule.dateLabel ? `命中 ${baseRule.dateLabel}` : '命中基础费用';
  const conditionText = baseRule.conditionLabel ? `；条件：${baseRule.conditionLabel}` : '';
  const extraText = matchedExtras.length ? `；加收费：${matchedExtras.map((item) => item.rule.name).join('、')}` : '；无加收费';
  return {
    ...input,
    roundedWeight: baseResult.chargedWeight,
    baseFee,
    surcharge,
    surchargeDetails,
    prepaid,
    total,
    quoteName: quote.quoteName,
    status: 'ok',
    explanation: `${periodText}${conditionText}；${weight.toFixed(2)}kg ${baseResult.explanation}${extraText}`,
  };
}
