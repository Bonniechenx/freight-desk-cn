'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Boxes, Calculator, CheckCircle2, ChevronRight, CircleAlert,
  Download, FileSpreadsheet, LayoutDashboard, MapPin, PackageCheck, Plus,
  ReceiptText, Save, Search, Settings2, ShieldCheck, Sparkles, Store,
  Trash2, Upload, Weight,
} from 'lucide-react';
import { readSheet } from 'read-excel-file/browser';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  calculateFreight, defaultPricing, defaultSurcharges, FeeResult,
  PricingConfig, ShipmentInput, SurchargeRule,
} from '@/lib/freight';

type View = 'single' | 'batch' | 'quotes' | 'bindings';
type Binding = { id: string; store: string; customer: string; quote: string; prepaid: number };

const provinces = ['广东省', '浙江省', '江苏省', '北京市', '上海市', '山东省', '四川省', '新疆', '西藏'];
const sampleShipments: ShipmentInput[] = [
  { trackingNo: 'YT20260915001', destination: '广东省深圳市', weight: 0.86, store: '森屿旗舰店', date: '2026-09-15' },
  { trackingNo: 'YT20260915002', destination: '浙江省杭州市', weight: 2.31, store: '森屿旗舰店', date: '2026-09-15' },
  { trackingNo: 'YT20260915003', destination: '北京市朝阳区', weight: 3.26, store: '北辰专营店', date: '2026-09-15' },
  { trackingNo: 'YT20260915004', destination: '新疆乌鲁木齐市', weight: 1.48, store: '云栈生活馆', date: '2026-09-15' },
  { trackingNo: 'YT20260915005', destination: '江苏省苏州市', weight: 5.08, store: '北辰专营店', date: '2026-09-15' },
];
const initialBindings: Binding[] = [
  { id: 'b1', store: '森屿旗舰店', customer: '森屿电商', quote: '默认客户报价', prepaid: 0 },
  { id: 'b2', store: '北辰专营店', customer: '北辰商贸', quote: '默认客户报价', prepaid: 1 },
  { id: 'b3', store: '云栈生活馆', customer: '云栈供应链', quote: '默认客户报价', prepaid: 2 },
];

export default function Home() {
  const [view, setView] = useState<View>('single');
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [surcharges, setSurcharges] = useState<SurchargeRule[]>(defaultSurcharges);
  const [bindings, setBindings] = useState<Binding[]>(initialBindings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('freight-desk-config');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.pricing) setPricing(parsed.pricing);
      if (parsed.surcharges) setSurcharges(parsed.surcharges);
      if (parsed.bindings) setBindings(parsed.bindings);
    } catch { /* ignore invalid local draft */ }
  }, []);

  const saveConfig = () => {
    window.localStorage.setItem('freight-desk-config', JSON.stringify({ pricing, surcharges, bindings }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[238px_minmax(0,1fr)]">
        <Sidebar view={view} setView={setView} />
        <main className="min-w-0">
          <Header view={view} saved={saved} saveConfig={saveConfig} />
          <MobileNav view={view} setView={setView} />
          <div className="mx-auto max-w-[1480px] p-4 md:p-8">
            {view === 'single' && <SingleCalculator pricing={pricing} surcharges={surcharges} bindings={bindings} goBatch={() => setView('batch')} />}
            {view === 'batch' && <BatchCalculator pricing={pricing} surcharges={surcharges} bindings={bindings} />}
            {view === 'quotes' && <QuoteEditor pricing={pricing} setPricing={setPricing} surcharges={surcharges} setSurcharges={setSurcharges} saveConfig={saveConfig} />}
            {view === 'bindings' && <BindingsEditor bindings={bindings} setBindings={setBindings} pricing={pricing} />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <aside className="hidden border-r border-slate-800 bg-[#08172b] text-white lg:flex lg:flex-col">
      <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
        <div className="grid size-10 place-items-center rounded-xl bg-teal-400 text-[#062134] shadow-[0_8px_24px_rgba(45,212,191,.22)]"><PackageCheck className="size-5" /></div>
        <div><p className="font-semibold tracking-wide">运费核算台</p><p className="text-[11px] text-slate-400">Freight Desk</p></div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6 text-sm">
        <NavItem icon={LayoutDashboard} label="单票试算" active={view === 'single'} onClick={() => setView('single')} />
        <NavItem icon={FileSpreadsheet} label="批量核算" active={view === 'batch'} onClick={() => setView('batch')} badge="XLSX" />
        <NavItem icon={ReceiptText} label="报价管理" active={view === 'quotes'} onClick={() => setView('quotes')} />
        <NavItem icon={Store} label="客户与店铺" active={view === 'bindings'} onClick={() => setView('bindings')} />
        <NavItem icon={Boxes} label="账单记录" onClick={() => setView('batch')} badge="本机" />
      </nav>
      <div className="m-4 rounded-2xl border border-white/10 bg-white/[.06] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-teal-300"><ShieldCheck className="size-4" /> 浏览器本地计算</div>
        <p className="text-xs leading-5 text-slate-400">报价与账单保留在当前设备，不上传业务数据。</p>
      </div>
    </aside>
  );
}

function Header({ view, saved, saveConfig }: { view: View; saved: boolean; saveConfig: () => void }) {
  const titles: Record<View, [string, string]> = {
    single: ['报价中心 / 单票试算', '快速核对一票运费'],
    batch: ['核算中心 / 批量账单', '批量计算与异常复核'],
    quotes: ['规则中心 / 报价管理', '维护计费规则'],
    bindings: ['客户中心 / 店铺绑定', '管理客户与报价关系'],
  };
  return (
    <header className="flex h-20 items-center justify-between border-b bg-white/85 px-4 backdrop-blur md:px-8">
      <div><p className="text-xs font-medium text-muted-foreground">{titles[view][0]}</p><h1 className="mt-1 text-lg font-semibold tracking-tight">{titles[view][1]}</h1></div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex"><span className="size-1.5 rounded-full bg-emerald-500" />{saved ? '已保存到本机' : '规则已校验'}</div>
        <Button variant="outline" className="h-9" onClick={saveConfig}>{saved ? <CheckCircle2 /> : <Save />}{saved ? '已保存' : '保存'}</Button>
      </div>
    </header>
  );
}

function MobileNav({ view, setView }: { view: View; setView: (view: View) => void }) {
  const items: [View, string][] = [['single', '试算'], ['batch', '批量'], ['quotes', '报价'], ['bindings', '店铺']];
  return <div className="flex gap-2 overflow-x-auto border-b bg-white px-4 py-3 lg:hidden">{items.map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${view === id ? 'bg-[#0b213b] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>;
}

function SingleCalculator({ pricing, surcharges, bindings, goBatch }: { pricing: PricingConfig; surcharges: SurchargeRule[]; bindings: Binding[]; goBatch: () => void }) {
  const [province, setProvince] = useState('广东省');
  const [weight, setWeight] = useState('3.26');
  const [store, setStore] = useState(bindings[0]?.store ?? '');
  const [date, setDate] = useState('2026-09-15');
  const binding = bindings.find((item) => item.store === store);
  const result = useMemo(() => calculateFreight({ trackingNo: '单票试算', destination: province, weight: Number(weight), store, date }, pricing, surcharges, binding?.prepaid ?? 0), [province, weight, store, date, pricing, surcharges, binding]);

  return (
    <>
      <PageIntro eyebrow={`${pricing.quoteName} · 当前生效`} title="输入目的地与重量，立即解释价格" description="系统依次完成地区匹配、重量取整、首续重计算、附加费与面单抵扣。" action={<Button onClick={goBatch} className="h-10 bg-[#0d7f75] px-4 text-white hover:bg-[#0a6d65]">进入批量核算 <ChevronRight /></Button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <Panel title="计费条件" description={`首重 ${pricing.firstWeight}kg / ¥${pricing.firstPrice}，续重 ${pricing.continuedStep}kg / ¥${pricing.continuedPrice}`}>
          <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
            <Field label="目的地" icon={MapPin}><NativeSelect value={province} onChange={(event) => setProvince(event.target.value)} className="h-11 bg-white">{provinces.map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="实际重量" icon={Weight}><InputWithUnit value={weight} setValue={setWeight} unit="kg" /></Field>
            <Field label="客户 / 店铺" icon={Store}><NativeSelect value={store} onChange={(event) => setStore(event.target.value)} className="h-11 bg-white">{bindings.map((item) => <NativeSelectOption key={item.id}>{item.store}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="发货日期" icon={FileSpreadsheet}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 bg-white" /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/70 px-5 py-4 text-xs text-muted-foreground md:px-6"><span>计费重量按 {pricing.continuedStep}kg {roundingText(pricing.rounding)}</span><span className="font-mono">报价 · {pricing.quoteName}</span></div>
        </Panel>
        <ResultCard result={result} />
      </div>
      <section className="mt-5 grid gap-4 md:grid-cols-3"><Metric label="示例账单" value="5" unit="票" trend="可直接试用" /><Metric label="附加费规则" value={String(surcharges.filter((item) => item.enabled).length)} unit="条" trend="已启用" /><Metric label="店铺绑定" value={String(bindings.length)} unit="个" trend="本机保存" /></section>
    </>
  );
}

function BatchCalculator({ pricing, surcharges, bindings }: { pricing: PricingConfig; surcharges: SurchargeRule[]; bindings: Binding[] }) {
  const [rows, setRows] = useState<ShipmentInput[]>(sampleShipments);
  const [fileName, setFileName] = useState('示例账单.xlsx');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('已载入示例数据，可直接查看计算结果');
  const fileRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rows.map((row) => {
    const binding = bindings.find((item) => item.store === row.store);
    return calculateFreight(row, pricing, surcharges, binding?.prepaid ?? 0);
  }), [rows, pricing, surcharges, bindings]);
  const filtered = results.filter((row) => [row.trackingNo, row.destination, row.store].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())));
  const total = results.reduce((sum, row) => sum + row.total, 0);
  const errors = results.filter((row) => row.status === 'error').length;

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const grid = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readSheet(file);
      const parsed = gridToShipments(grid);
      if (!parsed.length) throw new Error('没有识别到有效账单行');
      setRows(parsed); setFileName(file.name); setMessage(`已识别 ${parsed.length} 条账单，计算在当前浏览器完成`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '文件解析失败'); }
    finally { setLoading(false); event.target.value = ''; }
  };

  const download = () => {
    const headers = ['运单号', '目的地', '重量kg', '计费重量kg', '店铺', '日期', '基础费用', '附加费', '面单抵扣', '合计运费', '报价', '状态', '计算说明'];
    const data = results.map((row) => [row.trackingNo, row.destination, row.weight, row.roundedWeight, row.store ?? '', row.date ?? '', row.baseFee, row.surcharge, row.prepaid, row.total, row.quoteName, row.status === 'ok' ? '成功' : '异常', row.explanation]);
    downloadCsv('运费核算结果.csv', [headers, ...data]);
  };

  return (
    <>
      <PageIntro eyebrow="本地批量引擎" title="导入一张账单，逐票生成可解释费用" description="支持 XLSX、XLS 和 CSV；自动识别运单号、目的地、重量、店铺与日期列。" action={<><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importFile} /><Button onClick={() => fileRef.current?.click()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Upload />{loading ? '正在解析' : '导入账单'}</Button></>} />
      <section className="grid gap-4 md:grid-cols-3"><Metric label="账单行数" value={String(results.length)} unit="票" trend={fileName} /><Metric label="预计应收" value={`¥${total.toFixed(2)}`} unit="" trend="逐票汇总" /><Metric label="异常待复核" value={String(errors)} unit="票" trend={errors ? '请检查原始列' : '全部通过'} warning={errors > 0} /></section>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div><h3 className="font-semibold">{fileName}</h3><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>
          <div className="flex gap-2"><div className="relative min-w-0 flex-1 md:w-64"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索运单、地区或店铺" className="pl-8" /></div><Button variant="outline" onClick={download}><Download />导出 CSV</Button></div>
        </div>
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>运单号</TableHead><TableHead>目的地</TableHead><TableHead className="text-right">原重 / 计费重</TableHead><TableHead>店铺</TableHead><TableHead className="text-right">基础费</TableHead><TableHead className="text-right">附加费</TableHead><TableHead className="text-right">抵扣</TableHead><TableHead className="text-right">合计</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((row, index) => <TableRow key={`${row.trackingNo}-${index}`} title={row.explanation}><TableCell className="font-mono text-xs">{row.trackingNo}</TableCell><TableCell>{row.destination}</TableCell><TableCell className="text-right"><span className="text-muted-foreground">{row.weight}</span><ArrowRight className="mx-1 inline size-3" />{row.roundedWeight}</TableCell><TableCell>{row.store || '—'}</TableCell><TableCell className="text-right">¥{row.baseFee.toFixed(2)}</TableCell><TableCell className="text-right">¥{row.surcharge.toFixed(2)}</TableCell><TableCell className="text-right text-amber-700">-¥{row.prepaid.toFixed(2)}</TableCell><TableCell className="text-right font-semibold">¥{row.total.toFixed(2)}</TableCell><TableCell>{row.status === 'ok' ? <Status ok>成功</Status> : <Status>异常</Status>}</TableCell></TableRow>)}</TableBody>
        </Table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">没有符合搜索条件的账单</div>}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">列名可使用：运单号/快递单号、目的地/收件省份、重量/结算重量、店铺/客户、日期/账单日期。</p>
    </>
  );
}

function QuoteEditor({ pricing, setPricing, surcharges, setSurcharges, saveConfig }: { pricing: PricingConfig; setPricing: (value: PricingConfig) => void; surcharges: SurchargeRule[]; setSurcharges: (value: SurchargeRule[]) => void; saveConfig: () => void }) {
  const updateNumber = (key: keyof PricingConfig, value: string) => setPricing({ ...pricing, [key]: Number(value) || 0 });
  const updateRule = (id: string, patch: Partial<SurchargeRule>) => setSurcharges(surcharges.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addRule = () => setSurcharges([...surcharges, { id: crypto.randomUUID(), name: '新附加费', destinations: ['海南'], mode: 'ticket', amount: 1, enabled: true }]);
  return (
    <>
      <PageIntro eyebrow="草稿自动保留在当前浏览器" title="把报价规则变成可复用的计费模板" description="首版支持首续重、重量取整、折扣、最低收费和地区附加费。" action={<Button onClick={saveConfig} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Save />保存报价</Button>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]">
        <Panel title="基础费用" description="执行顺序：重量取整 → 首续重 → 折扣 → 最低收费">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <TextControl label="报价名称" value={pricing.quoteName} setValue={(value) => setPricing({ ...pricing, quoteName: value })} wide />
            <NumberControl label="首重重量" value={pricing.firstWeight} setValue={(value) => updateNumber('firstWeight', value)} unit="kg" />
            <NumberControl label="首重价格" value={pricing.firstPrice} setValue={(value) => updateNumber('firstPrice', value)} unit="元" />
            <NumberControl label="续重单位" value={pricing.continuedStep} setValue={(value) => updateNumber('continuedStep', value)} unit="kg" />
            <NumberControl label="续重价格" value={pricing.continuedPrice} setValue={(value) => updateNumber('continuedPrice', value)} unit="元" />
            <NumberControl label="最低收费" value={pricing.minimumCharge} setValue={(value) => updateNumber('minimumCharge', value)} unit="元" />
            <NumberControl label="折扣系数" value={pricing.discount} setValue={(value) => updateNumber('discount', value)} unit="×" />
            <label className="space-y-2"><span className="text-xs font-semibold text-slate-600">重量取整</span><NativeSelect value={pricing.rounding} onChange={(event) => setPricing({ ...pricing, rounding: event.target.value as PricingConfig['rounding'] })} className="h-10"><NativeSelectOption value="ceil">向上取整</NativeSelectOption><NativeSelectOption value="round">四舍五入</NativeSelectOption><NativeSelectOption value="floor">向下取整</NativeSelectOption><NativeSelectOption value="none">不取整</NativeSelectOption></NativeSelect></label>
          </div>
          <div className="border-t bg-teal-50/60 px-5 py-4 text-xs leading-5 text-teal-800">示例：3.26kg → {pricing.rounding === 'none' ? '3.26' : (Math.ceil(3.26 / pricing.continuedStep) * pricing.continuedStep).toFixed(2)}kg；首重 ¥{pricing.firstPrice}，随后每 {pricing.continuedStep}kg 加 ¥{pricing.continuedPrice}。</div>
        </Panel>
        <Panel title="地区附加费" description="命中多条启用规则时默认累加，并单独输出费用明细">
          <div className="divide-y">
            {surcharges.map((rule) => <div key={rule.id} className="grid gap-3 p-4 md:grid-cols-[auto_1fr_1.2fr_110px_40px] md:items-end">
              <Switch checked={rule.enabled} onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })} aria-label={`启用${rule.name}`} className="mb-2" />
              <TextControl label="规则名称" value={rule.name} setValue={(value) => updateRule(rule.id, { name: value })} />
              <TextControl label="适用地区（逗号分隔）" value={rule.destinations.join(',')} setValue={(value) => updateRule(rule.id, { destinations: value.split(/[,，\s]+/).filter(Boolean) })} />
              <NumberControl label={rule.mode === 'ticket' ? '元 / 票' : '元 / kg'} value={rule.amount} setValue={(value) => updateRule(rule.id, { amount: Number(value) || 0 })} />
              <Button variant="ghost" size="icon" onClick={() => setSurcharges(surcharges.filter((item) => item.id !== rule.id))} aria-label="删除附加费"><Trash2 className="text-rose-600" /></Button>
            </div>)}
          </div>
          <div className="border-t p-4"><Button variant="outline" onClick={addRule}><Plus />添加附加费</Button></div>
        </Panel>
      </div>
    </>
  );
}

function BindingsEditor({ bindings, setBindings, pricing }: { bindings: Binding[]; setBindings: (value: Binding[]) => void; pricing: PricingConfig }) {
  const [draft, setDraft] = useState({ store: '', customer: '', prepaid: '0' });
  const add = () => {
    if (!draft.store.trim() || !draft.customer.trim()) return;
    setBindings([...bindings, { id: crypto.randomUUID(), store: draft.store.trim(), customer: draft.customer.trim(), quote: pricing.quoteName, prepaid: Number(draft.prepaid) || 0 }]);
    setDraft({ store: '', customer: '', prepaid: '0' });
  };
  return (
    <>
      <PageIntro eyebrow="映射决定每一票使用哪份报价" title="一个客户可以绑定多个店铺" description="店铺名称用于总表自动匹配；预付面单费在计算完成后从应收中抵扣。" />
      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel title="新增绑定" description="数据仅保存在当前浏览器">
          <div className="space-y-4 p-5">
            <TextControl label="店铺名称" value={draft.store} setValue={(value) => setDraft({ ...draft, store: value })} placeholder="例如：森屿抖音店" />
            <TextControl label="所属客户" value={draft.customer} setValue={(value) => setDraft({ ...draft, customer: value })} placeholder="例如：森屿电商" />
            <TextControl label="所用报价" value={pricing.quoteName} setValue={() => {}} disabled />
            <NumberControl label="预付面单费" value={draft.prepaid} setValue={(value) => setDraft({ ...draft, prepaid: value })} unit="元" />
            <Button onClick={add} className="h-10 w-full bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Plus />添加绑定</Button>
          </div>
        </Panel>
        <Panel title="绑定关系" description={`${bindings.length} 个店铺已配置`}>
          <Table><TableHeader><TableRow className="bg-slate-50"><TableHead>店铺名称</TableHead><TableHead>所属客户</TableHead><TableHead>所用报价</TableHead><TableHead className="text-right">面单抵扣</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{bindings.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.store}</TableCell><TableCell>{item.customer}</TableCell><TableCell><Status ok>{item.quote}</Status></TableCell><TableCell className="text-right">¥{item.prepaid.toFixed(2)}</TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label="删除绑定" onClick={() => setBindings(bindings.filter((binding) => binding.id !== item.id))}><Trash2 className="text-rose-600" /></Button></TableCell></TableRow>)}</TableBody></Table>
        </Panel>
      </section>
    </>
  );
}

function ResultCard({ result }: { result: FeeResult }) {
  return <section className="rounded-2xl bg-[#0b213b] p-5 text-white shadow-[0_18px_50px_rgba(8,23,43,.2)] md:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-400">本票预计应收</p><div className="mt-2 flex items-baseline gap-1"><span className="text-4xl font-semibold tracking-tight">¥{result.total.toFixed(2)}</span><span className="text-sm text-slate-400">/ 票</span></div></div><div className="grid size-10 place-items-center rounded-xl bg-teal-400/15 text-teal-300"><Calculator /></div></div><div className="my-6 h-px bg-white/10" /><div className="space-y-4 text-sm"><PriceRow label="基础费用" value={result.baseFee} accent /><PriceRow label="地区附加费" value={result.surcharge} /><PriceRow label="面单抵扣" value={-result.prepaid} /></div><div className="mt-6 rounded-xl border border-white/10 bg-white/[.06] p-4"><p className="text-xs font-semibold text-teal-300">计算说明</p><p className="mt-2 text-sm leading-6 text-slate-300">{result.explanation}</p></div></section>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <section className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700"><CheckCircle2 className="size-3.5" />{eyebrow}</div><h2 className="text-2xl font-semibold tracking-[-.02em] md:text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</section>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_14px_44px_rgba(15,23,42,.05)]"><div className="border-b bg-[#f8fbfb] px-5 py-4"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{children}</section>;
}

function NavItem({ icon: Icon, label, active, badge, onClick }: { icon: typeof Calculator; label: string; active?: boolean; badge?: string; onClick: () => void }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[.05] hover:text-slate-200'}`}><Icon className={`size-[18px] ${active ? 'text-teal-300' : ''}`} /><span className="flex-1">{label}</span>{badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{badge}</span>}</button>;
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof MapPin; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="flex items-center gap-2 text-xs font-semibold text-slate-600"><Icon className="size-3.5 text-teal-600" />{label}</span>{children}</label>;
}

function InputWithUnit({ value, setValue, unit }: { value: string; setValue: (value: string) => void; unit: string }) {
  return <div className="relative"><Input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" className="h-11 bg-white pr-12 text-base font-medium" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{unit}</span></div>;
}

function TextControl({ label, value, setValue, placeholder, wide, disabled }: { label: string; value: string; setValue: (value: string) => void; placeholder?: string; wide?: boolean; disabled?: boolean }) {
  return <label className={`space-y-2 ${wide ? 'sm:col-span-2' : ''}`}><span className="text-xs font-semibold text-slate-600">{label}</span><Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} disabled={disabled} className="h-10" /></label>;
}

function NumberControl({ label, value, setValue, unit }: { label: string; value: number | string; setValue: (value: string) => void; unit?: string }) {
  return <label className="space-y-2"><span className="text-xs font-semibold text-slate-600">{label}</span><div className="relative"><Input type="number" min="0" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} className={unit ? 'h-10 pr-10' : 'h-10'} />{unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>}</div></label>;
}

function PriceRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-slate-400">{label}</span><span className={accent ? 'font-semibold text-white' : 'font-medium text-slate-200'}>{value < 0 ? '-' : ''}¥{Math.abs(value).toFixed(2)}</span></div>;
}

function Metric({ label, value, unit, trend, warning }: { label: string; value: string; unit: string; trend: string; warning?: boolean }) {
  return <div className="min-w-0 rounded-2xl border bg-white p-5"><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="shrink-0"><span className="text-2xl font-semibold">{value}</span><span className="ml-1 text-xs text-muted-foreground">{unit}</span></p><span className={`truncate rounded-full px-2 py-1 text-[11px] font-medium ${warning ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{trend}</span></div></div>;
}

function Status({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{ok ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}{children}</span>;
}

function roundingText(value: PricingConfig['rounding']) { return ({ ceil: '向上取整', round: '四舍五入', floor: '向下取整', none: '不取整' } as const)[value]; }

function parseCsv(text: string): (string | number | null)[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) { const char = text[i]; const next = text[i + 1]; if (char === '"' && quoted && next === '"') { field += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(field); field = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(field); if (row.some((item) => item.trim())) rows.push(row); row = []; field = ''; } else field += char; }
  row.push(field); if (row.some((item) => item.trim())) rows.push(row); return rows;
}

function gridToShipments(grid: unknown[][]): ShipmentInput[] {
  if (grid.length < 2) return [];
  const headers = grid[0].map((cell) => String(cell ?? '').trim().toLowerCase());
  const find = (patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  const track = find([/运单/, /快递单/, /tracking/]); const destination = find([/目的地/, /收件.*省/, /省份/, /destination/]); const weight = find([/结算重量/, /计费重量/, /^重量$/, /weight/]); const store = find([/店铺/, /客户/, /结算对象/, /store/]); const date = find([/日期/, /揽收时间/, /date/]);
  if (destination < 0 || weight < 0) throw new Error('未识别到目的地或重量列，请将表头命名为“目的地”和“重量”');
  return grid.slice(1).map((cells, index) => ({ trackingNo: String(cells[track] ?? `ROW-${index + 2}`), destination: String(cells[destination] ?? ''), weight: Number(cells[weight]), store: store >= 0 ? String(cells[store] ?? '') : '', date: date >= 0 ? formatCellDate(cells[date]) : '' })).filter((row) => row.destination || Number.isFinite(row.weight));
}

function formatCellDate(value: unknown) { if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value ?? ''); }

function downloadCsv(name: string, rows: (string | number)[][]) {
  const escaped = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${escaped}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
