export type RoundingMode = 'ceil' | 'round' | 'floor' | 'none';

export type PricingConfig = {
  quoteName: string;
  firstWeight: number;
  firstPrice: number;
  continuedStep: number;
  continuedPrice: number;
  minimumCharge: number;
  discount: number;
  rounding: RoundingMode;
};

export type SurchargeRule = {
  id: string;
  name: string;
  destinations: string[];
  mode: 'ticket' | 'weight';
  amount: number;
  enabled: boolean;
};

export type ShipmentInput = {
  trackingNo: string;
  destination: string;
  weight: number;
  quotePlan?: string;
  rateCondition?: string;
  store?: string;
  date?: string;
  sourceRow?: number;
};

export type FeeResult = ShipmentInput & {
  roundedWeight: number;
  baseFee: number;
  surcharge: number;
  prepaid: number;
  total: number;
  quoteName: string;
  status: 'ok' | 'error';
  explanation: string;
};

export const defaultPricing: PricingConfig = {
  quoteName: '默认客户报价',
  firstWeight: 1,
  firstPrice: 2.8,
  continuedStep: 0.5,
  continuedPrice: 0.6,
  minimumCharge: 2.8,
  discount: 1,
  rounding: 'ceil',
};

export const defaultSurcharges: SurchargeRule[] = [
  { id: 'remote', name: '偏远地区加收', destinations: ['新疆', '西藏'], mode: 'ticket', amount: 12, enabled: true },
  { id: 'metro', name: '京沪加收', destinations: ['北京', '上海'], mode: 'ticket', amount: 1, enabled: true },
];

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function roundWeight(weight: number, step: number, mode: RoundingMode) {
  if (mode === 'none' || step <= 0) return weight;
  const ratio = weight / step;
  const rounded = mode === 'ceil' ? Math.ceil(ratio) : mode === 'floor' ? Math.floor(ratio) : Math.round(ratio);
  return round2(rounded * step);
}

function normalized(value: string) {
  return value.replace(/壮族自治区|维吾尔自治区|回族自治区|自治区|特别行政区|省|市|区|县|\s/g, '');
}

export function calculateFreight(
  input: ShipmentInput,
  pricing: PricingConfig,
  surchargeRules: SurchargeRule[],
  prepaid = 0,
): FeeResult {
  const weight = Number(input.weight);
  if (!input.destination.trim() || !Number.isFinite(weight) || weight <= 0) {
    return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName: pricing.quoteName, status: 'error', explanation: '目的地为空或重量不是有效正数' };
  }

  const roundedWeight = roundWeight(weight, pricing.continuedStep, pricing.rounding);
  const units = roundedWeight <= pricing.firstWeight ? 0 : Math.ceil((roundedWeight - pricing.firstWeight) / pricing.continuedStep);
  const formulaFee = pricing.firstPrice + units * pricing.continuedPrice;
  const baseFee = round2(Math.max(formulaFee * pricing.discount, pricing.minimumCharge));
  const target = normalized(input.destination);
  const matchedRules = surchargeRules.filter((rule) => rule.enabled && rule.destinations.some((place) => target.includes(normalized(place))));
  const surcharge = round2(matchedRules.reduce((sum, rule) => sum + (rule.mode === 'ticket' ? rule.amount : roundedWeight * rule.amount), 0));
  const total = round2(Math.max(0, baseFee + surcharge - prepaid));
  const ruleText = matchedRules.length ? matchedRules.map((rule) => rule.name).join('、') : '无地区附加费';

  return {
    ...input,
    roundedWeight,
    baseFee,
    surcharge,
    prepaid,
    total,
    quoteName: pricing.quoteName,
    status: 'ok',
    explanation: `${weight.toFixed(2)}kg → ${roundedWeight.toFixed(2)}kg；首重 ¥${pricing.firstPrice.toFixed(2)} + ${units} 个续重单位；${ruleText}`,
  };
}
