'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, Boxes, Calculator, CheckCircle2, ChevronRight, CircleAlert,
  Download, FileSpreadsheet, LayoutDashboard, MapPin, PackageCheck, Plus,
  ReceiptText, Save, Search, ShieldCheck, Store,
  Trash2, Upload, Weight,
} from 'lucide-react';
import readXlsxFile, { readSheet } from 'read-excel-file/browser';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  calculateFreight, defaultPricing, defaultSurcharges, FeeResult,
  PricingConfig, ShipmentInput, SurchargeRule,
} from '@/lib/freight';
import {
  calculateWorkbookFreight, ImportedWorkbookQuote, parseWorkbookQuote, WorkbookSheet,
} from '@/lib/quote-workbook';

type View = 'single' | 'batch' | 'quotes' | 'bindings';
type Binding = { id: string; store: string; customer: string; quote: string; prepaid: number };

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
const bindingTemplateHeaders = ['客户名称', '店铺名称', '报价名称', '预付面单费(元)'];

export default function Home() {
  const [view, setView] = useState<View>('single');
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [surcharges, setSurcharges] = useState<SurchargeRule[]>(defaultSurcharges);
  const [bindings, setBindings] = useState<Binding[]>(initialBindings);
  const [workbookQuote, setWorkbookQuote] = useState<ImportedWorkbookQuote | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem('freight-desk-config');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed.pricing) setPricing(parsed.pricing);
      if (parsed.surcharges) setSurcharges(parsed.surcharges);
      if (parsed.bindings) setBindings(parsed.bindings);
      if (parsed.workbookQuote) setWorkbookQuote(parsed.workbookQuote);
    } catch { /* ignore invalid local draft */ }
  }, []);

  const saveConfig = () => {
    window.localStorage.setItem('freight-desk-config', JSON.stringify({ pricing, surcharges, bindings, workbookQuote }));
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
            {view === 'single' && <SingleCalculator pricing={pricing} surcharges={surcharges} workbookQuote={workbookQuote} bindings={bindings} goBatch={() => setView('batch')} />}
            {view === 'batch' && <BatchCalculator pricing={pricing} surcharges={surcharges} workbookQuote={workbookQuote} bindings={bindings} />}
            {view === 'quotes' && <QuoteEditor pricing={pricing} setPricing={setPricing} surcharges={surcharges} setSurcharges={setSurcharges} workbookQuote={workbookQuote} setWorkbookQuote={setWorkbookQuote} saveConfig={saveConfig} />}
            {view === 'bindings' && <BindingsEditor bindings={bindings} setBindings={setBindings} quoteName={workbookQuote?.quoteName ?? pricing.quoteName} />}
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

function SingleCalculator({ pricing, surcharges, workbookQuote, bindings, goBatch }: { pricing: PricingConfig; surcharges: SurchargeRule[]; workbookQuote: ImportedWorkbookQuote | null; bindings: Binding[]; goBatch: () => void }) {
  const [destination, setDestination] = useState('广东省深圳市');
  const [weight, setWeight] = useState('3.26');
  const [store, setStore] = useState(bindings[0]?.store ?? '');
  const [rateCondition, setRateCondition] = useState('');
  const [date, setDate] = useState('2026-09-15');
  const binding = bindings.find((item) => item.store === store);
  const activeQuoteName = workbookQuote?.quoteName ?? pricing.quoteName;
  const result = useMemo(() => {
    const input = { trackingNo: '单票试算', destination, weight: Number(weight), store, rateCondition, date };
    return workbookQuote ? calculateWorkbookFreight(input, workbookQuote, binding?.prepaid ?? 0) : calculateFreight(input, pricing, surcharges, binding?.prepaid ?? 0);
  }, [destination, weight, store, rateCondition, date, pricing, surcharges, workbookQuote, binding]);

  return (
    <>
      <PageIntro eyebrow={`${activeQuoteName} · 当前生效`} title="输入计费条件，立即解释价格" description="先按店铺确定报价表，再匹配物流公司或渠道、生效日期、目的地、公斤段和加收费。" action={<Button onClick={goBatch} className="h-10 bg-[#0d7f75] px-4 text-white hover:bg-[#0a6d65]">进入批量核算 <ChevronRight /></Button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <Panel title="计费条件" description={workbookQuote ? `${workbookQuote.periods.length || 1} 个生效期，${workbookQuote.bandLabels.length} 个表头公斤段` : `首重 ${pricing.firstWeight}kg / ¥${pricing.firstPrice}，续重 ${pricing.continuedStep}kg / ¥${pricing.continuedPrice}`}>
          <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
            <Field label="目的地（省 / 市）" icon={MapPin}><Input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="例如：广东省深圳市" className="h-11 bg-white" /></Field>
            <Field label="实际重量" icon={Weight}><InputWithUnit value={weight} setValue={setWeight} unit="kg" /></Field>
            <Field label="客户 / 店铺" icon={Store}><NativeSelect value={store} onChange={(event) => setStore(event.target.value)} className="h-11 bg-white">{bindings.map((item) => <NativeSelectOption key={item.id}>{item.store}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="物流公司 / 报价条件" icon={Boxes}><Input value={rateCondition} onChange={(event) => setRateCondition(event.target.value)} placeholder="例如：九象圆通拼多多0-2" className="h-11 bg-white" /></Field>
            <Field label="发货日期" icon={FileSpreadsheet}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 bg-white" /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/70 px-5 py-4 text-xs text-muted-foreground md:px-6"><span>{workbookQuote ? `按报价表头自动识别阶梯价与续重方式` : `计费重量按 ${pricing.continuedStep}kg ${roundingText(pricing.rounding)}`}</span><span className="font-mono">报价 · {activeQuoteName}</span></div>
        </Panel>
        <ResultCard result={result} />
      </div>
      <section className="mt-5 grid gap-4 md:grid-cols-3"><Metric label="示例账单" value="5" unit="票" trend="可直接试用" /><Metric label="加收费规则" value={String(workbookQuote ? workbookQuote.extraRules.length : surcharges.filter((item) => item.enabled).length)} unit="条" trend={workbookQuote ? '来自独立 Sheet' : '已启用'} /><Metric label="店铺绑定" value={String(bindings.length)} unit="个" trend="本机保存" /></section>
    </>
  );
}

type BatchColumnMapping = {
  destination: string;
  weight: string;
  quotePlan: string;
  rateCondition: string;
  trackingNo: string;
  store: string;
  date: string;
};

type PendingBatchImport = {
  fileName: string;
  grid: unknown[][];
  headerRow: number;
};

function BatchCalculator({ pricing, surcharges, workbookQuote, bindings }: { pricing: PricingConfig; surcharges: SurchargeRule[]; workbookQuote: ImportedWorkbookQuote | null; bindings: Binding[] }) {
  const [rows, setRows] = useState<ShipmentInput[]>(sampleShipments);
  const [fileName, setFileName] = useState('示例账单.xlsx');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('已载入示例数据，可直接查看计算结果');
  const [mappingError, setMappingError] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingBatchImport | null>(null);
  const [mapping, setMapping] = useState<BatchColumnMapping>({ destination: '', weight: '', quotePlan: '', rateCondition: '', trackingNo: '', store: '', date: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rows.map((row) => {
    const activeQuoteName = workbookQuote?.quoteName ?? pricing.quoteName;
    if (row.sourceRow && !row.quotePlan?.trim()) {
      return { ...row, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid: 0, total: 0, quoteName: activeQuoteName, status: 'error' as const, explanation: `原表第 ${row.sourceRow} 行的报价方案为空` };
    }
    if (row.quotePlan && !quoteNamesMatch(row.quotePlan, activeQuoteName)) {
      return { ...row, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid: 0, total: 0, quoteName: row.quotePlan, status: 'error' as const, explanation: `账单指定报价“${row.quotePlan}”，当前只启用了“${activeQuoteName}”` };
    }
    const binding = bindings.find((item) => item.store === row.store);
    return workbookQuote ? calculateWorkbookFreight(row, workbookQuote, binding?.prepaid ?? 0) : calculateFreight(row, pricing, surcharges, binding?.prepaid ?? 0);
  }), [rows, pricing, surcharges, workbookQuote, bindings]);
  const filtered = results.filter((row) => [row.trackingNo, row.destination, row.store, row.quotePlan, row.rateCondition].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())));
  const total = results.reduce((sum, row) => sum + row.total, 0);
  const errors = results.filter((row) => row.status === 'error').length;
  const columnOptions = pendingImport ? getColumnOptions(pendingImport.grid, pendingImport.headerRow) : [];
  const previewRows = pendingImport ? pendingImport.grid.slice(pendingImport.headerRow + 1).map((row, index) => ({ row, sourceRow: pendingImport.headerRow + index + 2 })).filter((item) => rowHasValue(item.row)).slice(0, 4) : [];
  const headerCandidates = pendingImport ? getHeaderCandidates(pendingImport.grid) : [];

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const grid = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readSheet(file);
      if (grid.length < 2) throw new Error('表格中没有足够的数据行');
      const headerRow = detectHeaderRow(grid);
      setPendingImport({ fileName: file.name, grid, headerRow });
      setMapping(inferBatchMapping(grid, headerRow));
      setMappingError('');
      setMessage(`已读取 ${file.name}，请选择各字段所在列`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '文件解析失败'); }
    finally { setLoading(false); event.target.value = ''; }
  };

  const changeHeaderRow = (value: string) => {
    if (!pendingImport) return;
    const headerRow = Number(value);
    setPendingImport({ ...pendingImport, headerRow });
    setMapping(inferBatchMapping(pendingImport.grid, headerRow));
    setMappingError('');
  };

  const applyMapping = () => {
    if (!pendingImport) return;
    const requiresCondition = (workbookQuote?.conditionLabels?.length ?? 0) > 0;
    const requiresDate = (workbookQuote?.periods?.length ?? 0) > 0;
    const required = [mapping.destination, mapping.weight, mapping.quotePlan, ...(requiresCondition ? [mapping.rateCondition] : []), ...(requiresDate ? [mapping.date] : [])];
    if (required.some((value) => value === '')) {
      const extras = [requiresCondition ? '物流公司/报价条件' : '', requiresDate ? '发货日期' : ''].filter(Boolean).join('和');
      setMappingError(`请先选择目的地、重量、报价方案${extras ? `、${extras}` : ''}列`);
      return;
    }
    if (new Set(required).size !== required.length) {
      setMappingError('必选字段不能选择同一列');
      return;
    }
    const parsed = gridToMappedShipments(pendingImport.grid, pendingImport.headerRow, mapping);
    if (!parsed.length) {
      setMappingError('所选列下方没有可导入的数据');
      return;
    }
    setRows(parsed);
    setFileName(pendingImport.fileName);
    setMessage(`已按你的列选择导入 ${parsed.length} 条账单`);
    setMappingError('');
    setPendingImport(null);
  };

  const download = () => {
    const headers = ['原表行号', '运单号', '目的地', '重量kg', '计费重量kg', '店铺', '物流公司/报价条件', '日期', '账单报价方案', '实际使用报价', '基础费用', '附加费', '面单抵扣', '合计运费', '状态', '计算说明'];
    const data = results.map((row) => [row.sourceRow ?? '', row.trackingNo, row.destination, row.weight, row.roundedWeight, row.store ?? '', row.rateCondition ?? '', row.date ?? '', row.quotePlan ?? '', row.quoteName, row.baseFee, row.surcharge, row.prepaid, row.total, row.status === 'ok' ? '成功' : '异常', row.explanation]);
    downloadCsv('运费核算结果.csv', [headers, ...data]);
  };

  return (
    <>
      <PageIntro eyebrow="任意表头均可导入" title="上传账单后，由你指定计费列" description="店铺决定报价表；物流公司或报价条件、发货日期决定表内使用哪组价格。" action={<><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importFile} /><Button onClick={() => fileRef.current?.click()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Upload />{loading ? '正在读取' : '导入账单'}</Button></>} />
      {pendingImport && <section className="mb-5 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-[0_14px_44px_rgba(15,23,42,.06)]">
        <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/70 p-5 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold text-teal-700">已读取原始账单</p><h3 className="mt-1 font-semibold">{pendingImport.fileName}</h3><p className="mt-1 text-xs text-muted-foreground">原表不会被修改。报价方案值会与“报价管理”中已启用的报价匹配。</p></div><Button variant="ghost" onClick={() => setPendingImport(null)}>取消本次导入</Button></div>
        <div className="grid gap-4 p-5 lg:grid-cols-4">
          <MappingSelect label="表头所在行" value={String(pendingImport.headerRow)} setValue={changeHeaderRow} options={headerCandidates.map((item) => ({ value: String(item.index), label: item.label }))} />
          <MappingSelect required label="目的地列" value={mapping.destination} setValue={(value) => setMapping({ ...mapping, destination: value })} options={columnOptions} />
          <MappingSelect required label="重量列" value={mapping.weight} setValue={(value) => setMapping({ ...mapping, weight: value })} options={columnOptions} />
          <MappingSelect required label="报价方案列" value={mapping.quotePlan} setValue={(value) => setMapping({ ...mapping, quotePlan: value })} options={columnOptions} />
          <MappingSelect required={(workbookQuote?.conditionLabels?.length ?? 0) > 0} label="物流公司 / 报价条件列" value={mapping.rateCondition} setValue={(value) => setMapping({ ...mapping, rateCondition: value })} options={columnOptions} optional={(workbookQuote?.conditionLabels?.length ?? 0) === 0} />
          <MappingSelect label="运单号列（可选）" value={mapping.trackingNo} setValue={(value) => setMapping({ ...mapping, trackingNo: value })} options={columnOptions} optional />
          <MappingSelect label="店铺列（可选）" value={mapping.store} setValue={(value) => setMapping({ ...mapping, store: value })} options={columnOptions} optional />
          <MappingSelect required={(workbookQuote?.periods?.length ?? 0) > 0} label={`发货日期列${(workbookQuote?.periods?.length ?? 0) > 0 ? '' : '（可选）'}`} value={mapping.date} setValue={(value) => setMapping({ ...mapping, date: value })} options={columnOptions} optional={(workbookQuote?.periods?.length ?? 0) === 0} />
          <div className="flex items-end"><Button onClick={applyMapping} className="h-10 w-full bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Calculator />按所选列开始计算</Button></div>
        </div>
        {mappingError && <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700"><CircleAlert className="mr-2 inline size-4" />{mappingError}</div>}
        <div className="overflow-x-auto border-t"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>原表行</TableHead><TableHead>目的地预览</TableHead><TableHead>重量预览</TableHead><TableHead>报价方案预览</TableHead><TableHead>条件预览</TableHead></TableRow></TableHeader><TableBody>{previewRows.map((item) => <TableRow key={item.sourceRow}><TableCell className="text-muted-foreground">{item.sourceRow}</TableCell><TableCell>{cellPreview(item.row, mapping.destination)}</TableCell><TableCell>{cellPreview(item.row, mapping.weight)}</TableCell><TableCell>{cellPreview(item.row, mapping.quotePlan)}</TableCell><TableCell>{cellPreview(item.row, mapping.rateCondition)}</TableCell></TableRow>)}</TableBody></Table></div>
      </section>}
      <section className="grid gap-4 md:grid-cols-3"><Metric label="账单行数" value={String(results.length)} unit="票" trend={fileName} /><Metric label="预计应收" value={`¥${total.toFixed(2)}`} unit="" trend="逐票汇总" /><Metric label="异常待复核" value={String(errors)} unit="票" trend={errors ? '请检查原始列' : '全部通过'} warning={errors > 0} /></section>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div><h3 className="font-semibold">{fileName}</h3><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>
          <div className="flex gap-2"><div className="relative min-w-0 flex-1 md:w-64"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索运单、地区或店铺" className="pl-8" /></div><Button variant="outline" onClick={download}><Download />导出 CSV</Button></div>
        </div>
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>运单号</TableHead><TableHead>目的地</TableHead><TableHead>报价方案</TableHead><TableHead>物流公司 / 条件</TableHead><TableHead className="text-right">原重 / 计费重</TableHead><TableHead>店铺</TableHead><TableHead className="text-right">基础费</TableHead><TableHead className="text-right">附加费</TableHead><TableHead className="text-right">抵扣</TableHead><TableHead className="text-right">合计</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((row, index) => <TableRow key={`${row.trackingNo}-${index}`} title={row.explanation}><TableCell className="font-mono text-xs">{row.trackingNo}</TableCell><TableCell>{row.destination}</TableCell><TableCell>{row.quotePlan || row.quoteName}</TableCell><TableCell>{row.rateCondition || '—'}</TableCell><TableCell className="text-right"><span className="text-muted-foreground">{row.weight}</span><ArrowRight className="mx-1 inline size-3" />{row.roundedWeight}</TableCell><TableCell>{row.store || '—'}</TableCell><TableCell className="text-right">¥{row.baseFee.toFixed(2)}</TableCell><TableCell className="text-right">¥{row.surcharge.toFixed(2)}</TableCell><TableCell className="text-right text-amber-700">-¥{row.prepaid.toFixed(2)}</TableCell><TableCell className="text-right font-semibold">¥{row.total.toFixed(2)}</TableCell><TableCell>{row.status === 'ok' ? <Status ok>成功</Status> : <Status>异常</Status>}</TableCell></TableRow>)}</TableBody>
        </Table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">没有符合搜索条件的账单</div>}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">无需固定表头。系统只读取你选中的列，并保留原表行号供异常复核。</p>
    </>
  );
}

function QuoteEditor({ pricing, setPricing, surcharges, setSurcharges, workbookQuote, setWorkbookQuote, saveConfig }: { pricing: PricingConfig; setPricing: (value: PricingConfig) => void; surcharges: SurchargeRule[]; setSurcharges: (value: SurchargeRule[]) => void; workbookQuote: ImportedWorkbookQuote | null; setWorkbookQuote: (value: ImportedWorkbookQuote | null) => void; saveConfig: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const updateNumber = (key: keyof PricingConfig, value: string) => setPricing({ ...pricing, [key]: Number(value) || 0 });
  const updateRule = (id: string, patch: Partial<SurchargeRule>) => setSurcharges(surcharges.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addRule = () => setSurcharges([...surcharges, { id: crypto.randomUUID(), name: '新附加费', destinations: ['海南'], mode: 'ticket', amount: 1, enabled: true }]);
  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage('');
    try {
      const sheets = await readXlsxFile(file);
      const imported = parseWorkbookQuote(file.name, sheets as WorkbookSheet[]);
      setWorkbookQuote(imported);
      setImportError(false);
      setImportMessage(`已识别“${imported.quoteName}”：${imported.baseRules.length} 条基础费用、${imported.extraRules.length} 条加收费，请检查后点击保存报价`);
    } catch (error) {
      setImportError(true);
      setImportMessage(error instanceof Error ? error.message : '运费宝报价解析失败');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };
  return (
    <>
      <PageIntro eyebrow="按工作表和表头自动识别" title="直接导入现有的运费宝报价" description="同一报价表可按物流公司或渠道、生效日期、目的地和重量保存多组价格，系统会自动选择最具体的规则。" action={<div className="flex flex-wrap gap-2"><input ref={fileRef} className="hidden" type="file" accept=".xlsx" onChange={importTemplate} /><Button variant="outline" onClick={() => fileRef.current?.click()} className="h-10"><Upload />{importing ? '正在识别' : '导入运费宝报价'}</Button><Button onClick={saveConfig} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Save />保存报价</Button></div>} />
      {workbookQuote ? <section className="mb-5 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]">
        <div className="flex flex-col gap-3 border-b border-emerald-100 bg-emerald-50/70 p-5 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="size-4" />多 Sheet 报价已启用</div><h3 className="mt-2 text-lg font-semibold">{workbookQuote.quoteName}</h3><p className="mt-1 text-xs text-muted-foreground">来源：{workbookQuote.sourceFile}</p></div><Button variant="outline" onClick={() => setWorkbookQuote(null)}>切换为手工报价</Button></div>
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><Metric label="基础费用规则" value={String(workbookQuote.baseRules.length)} unit="条" trend={`${workbookQuote.periods.length || 1} 个生效期`} /><Metric label="物流 / 条件规则" value={String(workbookQuote.conditionLabels?.length ?? 0)} unit="种" trend={(workbookQuote.conditionLabels?.length ?? 0) ? '表内自动选择' : '无附加条件'} /><Metric label="表头公斤段" value={String(workbookQuote.bandLabels.length)} unit="个" trend={workbookQuote.bandLabels.join(' / ')} /><Metric label="加收费规则" value={String(workbookQuote.extraRules.length)} unit="条" trend="独立 Sheet" /></div>
        <div className="grid gap-4 border-t p-5 lg:grid-cols-3"><div><p className="text-xs font-semibold text-slate-600">已识别工作表</p><div className="mt-2 flex flex-wrap gap-2">{workbookQuote.detectedSheets.map((name) => <span key={name} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{name}</span>)}</div></div><div><p className="text-xs font-semibold text-slate-600">物流公司 / 报价条件</p><div className="mt-2 flex flex-wrap gap-2">{(workbookQuote.conditionLabels?.length ?? 0) ? workbookQuote.conditionLabels.slice(0, 8).map((name) => <span key={name} className="rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-700">{name}</span>) : <span className="text-xs text-muted-foreground">未设置条件</span>}</div></div><div><p className="text-xs font-semibold text-slate-600">全局设置</p><p className="mt-2 text-xs leading-5 text-muted-foreground">双重量：{workbookQuote.globalSettings.doubleWeight ? '开启' : '关闭'}；仅续重取整：{workbookQuote.globalSettings.roundContinuedOnly ? '开启' : '关闭'}；合计金额：{workbookQuote.globalSettings.totalRounding}</p></div></div>
        {workbookQuote.warnings.length > 0 && <div className="border-t border-amber-100 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">{workbookQuote.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
      </section> : <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"><FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-sky-600" /><div><p className="font-semibold">无需转换模板</p><p className="mt-1 text-xs leading-5 text-sky-800">直接选择现有 XLSX 报价文件。系统会优先读取“基础费用”，并分别读取“加收费用”和“全局设置”。</p></div></div>}
      {importMessage && <div className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${importError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{importError ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}<span>{importMessage}</span></div>}
      {!workbookQuote && <><div className="mb-3"><h3 className="font-semibold">手工报价</h3><p className="mt-1 text-xs text-muted-foreground">没有现成运费宝文件时，可用这组简化规则试算。</p></div>
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
      </div></>}
    </>
  );
}

function BindingsEditor({ bindings, setBindings, quoteName }: { bindings: Binding[]; setBindings: (value: Binding[]) => void; quoteName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ store: '', customer: '', prepaid: '0' });
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const add = () => {
    if (!draft.store.trim() || !draft.customer.trim()) return;
    setBindings([...bindings, { id: crypto.randomUUID(), store: draft.store.trim(), customer: draft.customer.trim(), quote: quoteName, prepaid: Number(draft.prepaid) || 0 }]);
    setDraft({ store: '', customer: '', prepaid: '0' });
  };
  const downloadTemplate = () => {
    const rows = bindings.length ? bindings.map((item) => [item.customer, item.store, item.quote, item.prepaid]) : [['示例客户', '示例旗舰店', quoteName, 0]];
    downloadCsv('客户店铺结算关系固定模板.csv', [bindingTemplateHeaders, ...rows]);
  };
  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage('');
    try {
      const grid = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readSheet(file);
      const imported = parseBindingTemplate(grid, quoteName);
      setBindings(imported);
      setImportError(false);
      setImportMessage(`已导入 ${imported.length} 条结算关系，点击页面右上角“保存”后保留在本机`);
    } catch (error) {
      setImportError(true);
      setImportMessage(error instanceof Error ? error.message : '结算关系模板解析失败');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };
  return (
    <>
      <PageIntro eyebrow="映射决定每一票使用哪份报价" title="一个客户可以绑定多个店铺" description="店铺名称用于总表自动匹配；预付面单费在计算完成后从应收中抵扣。" action={<div className="flex flex-wrap gap-2"><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} /><Button variant="outline" onClick={downloadTemplate} className="h-10"><Download />下载关系模板</Button><Button onClick={() => fileRef.current?.click()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Upload />{importing ? '正在导入' : '导入结算关系'}</Button></div>} />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900">
        <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <div><p className="font-semibold">结算关系模板说明</p><p className="mt-1 text-xs leading-5 text-sky-800">支持 XLSX、XLS 和 CSV。固定列为客户名称、店铺名称、报价名称、预付面单费；同一店铺只能出现一次，报价名称需与当前报价“{quoteName}”一致。</p></div>
      </div>
      {importMessage && <div className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${importError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{importError ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}<span>{importMessage}</span></div>}
      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel title="新增绑定" description="数据仅保存在当前浏览器">
          <div className="space-y-4 p-5">
            <TextControl label="店铺名称" value={draft.store} setValue={(value) => setDraft({ ...draft, store: value })} placeholder="例如：森屿抖音店" />
            <TextControl label="所属客户" value={draft.customer} setValue={(value) => setDraft({ ...draft, customer: value })} placeholder="例如：森屿电商" />
            <TextControl label="所用报价" value={quoteName} setValue={() => {}} disabled />
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

function MappingSelect({ label, value, setValue, options, required, optional }: { label: string; value: string; setValue: (value: string) => void; options: { value: string; label: string }[]; required?: boolean; optional?: boolean }) {
  return <label className="space-y-2"><span className="text-xs font-semibold text-slate-600">{label}{required && <span className="ml-1 text-rose-500">*</span>}</span><NativeSelect value={value} onChange={(event) => setValue(event.target.value)} className="h-10 bg-white"><NativeSelectOption value="">{optional ? '不使用此列' : '请选择一列'}</NativeSelectOption>{options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}</NativeSelect></label>;
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

function cellText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value).trim();
  return '';
}

function rowHasValue(row: unknown[]) {
  return row.some((cell) => cellText(cell) !== '');
}

function columnLetter(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function detectHeaderRow(grid: unknown[][]) {
  const candidates = grid.slice(0, 20).map((row, index) => ({ index, count: row.filter((cell) => cellText(cell) !== '').length }));
  return candidates.sort((a, b) => b.count - a.count || a.index - b.index)[0]?.index ?? 0;
}

function getHeaderCandidates(grid: unknown[][]) {
  return grid.slice(0, 20).map((row, index) => ({ index, cells: row.map(cellText).filter(Boolean) })).filter((item) => item.cells.length).map((item) => ({ index: item.index, label: `第 ${item.index + 1} 行 · ${item.cells.slice(0, 3).join(' / ')}` }));
}

function getColumnOptions(grid: unknown[][], headerRow: number) {
  const nearbyRows = grid.slice(headerRow, headerRow + 6);
  const columnCount = nearbyRows.reduce((largest, row) => Math.max(largest, row.length), 0);
  return Array.from({ length: columnCount }, (_, index) => {
    const heading = cellText(grid[headerRow]?.[index]) || '无表头';
    const sample = grid.slice(headerRow + 1, headerRow + 5).map((row) => cellText(row[index])).find(Boolean);
    return { value: String(index), label: `${columnLetter(index)}列 · ${heading}${sample ? `（例：${sample.slice(0, 12)}）` : ''}` };
  });
}

function inferBatchMapping(grid: unknown[][], headerRow: number): BatchColumnMapping {
  const headers = (grid[headerRow] ?? []).map((cell) => cellText(cell).toLowerCase());
  const find = (patterns: RegExp[]) => {
    const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return index < 0 ? '' : String(index);
  };
  return {
    destination: find([/目的地/, /收件.*省/, /收货.*地/, /省份/, /destination/]),
    weight: find([/结算重量/, /计费重量/, /实际重量/, /重量/, /weight/]),
    quotePlan: find([/报价方案/, /报价名称/, /计费方案/, /快递产品/, /承运方案/]),
    rateCondition: find([/物流公司/, /物流渠道/, /承运公司/, /快递公司/, /报价条件/, /计费条件/]),
    trackingNo: find([/运单号/, /快递单号/, /物流单号/, /tracking/]),
    store: find([/店铺/, /客户/, /结算对象/, /store/]),
    date: find([/发货日期/, /揽收时间/, /账单日期/, /日期/, /date/]),
  };
}

function parseWeightCell(value: unknown) {
  if (typeof value === 'number') return value;
  const normalized = cellText(value).replaceAll(',', '').replace(/千克|公斤|kg/gi, '').trim();
  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : Number.NaN;
}

function gridToMappedShipments(grid: unknown[][], headerRow: number, mapping: BatchColumnMapping): ShipmentInput[] {
  const indexOf = (value: string) => value === '' ? -1 : Number(value);
  const destination = indexOf(mapping.destination);
  const weight = indexOf(mapping.weight);
  const quotePlan = indexOf(mapping.quotePlan);
  const rateCondition = indexOf(mapping.rateCondition);
  const trackingNo = indexOf(mapping.trackingNo);
  const store = indexOf(mapping.store);
  const date = indexOf(mapping.date);
  return grid.slice(headerRow + 1).map((row, index) => ({ row, sourceRow: headerRow + index + 2 })).filter(({ row }) => rowHasValue(row) && [destination, weight, quotePlan].some((column) => cellText(row[column]) !== '')).map(({ row, sourceRow }) => ({
    trackingNo: trackingNo >= 0 ? cellText(row[trackingNo]) || `ROW-${sourceRow}` : `ROW-${sourceRow}`,
    destination: cellText(row[destination]),
    weight: parseWeightCell(row[weight]),
    quotePlan: cellText(row[quotePlan]),
    rateCondition: rateCondition >= 0 ? cellText(row[rateCondition]) : '',
    store: store >= 0 ? cellText(row[store]) : '',
    date: date >= 0 ? formatCellDate(row[date]) : '',
    sourceRow,
  }));
}

function cellPreview(row: unknown[], column: string) {
  if (column === '') return <span className="text-amber-600">请选择列</span>;
  return cellText(row[Number(column)]) || <span className="text-muted-foreground">空白</span>;
}

function quoteNamesMatch(requested: string, active: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/\.(xlsx|xls)$/i, '').replace(/[\s_—–-]+/g, '');
  const requestedName = normalize(requested);
  const activeName = normalize(active);
  return requestedName === activeName || (requestedName.length >= 2 && activeName.includes(requestedName)) || (activeName.length >= 2 && requestedName.includes(activeName));
}

function parseBindingTemplate(grid: unknown[][], activeQuote: string): Binding[] {
  if (grid.length < 2) throw new Error('模板中没有可导入的结算关系');
  const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[（）\s]/g, (char) => char === '（' ? '(' : char === '）' ? ')' : '');
  const headers = grid[0].map(normalizeHeader);
  const indexOf = (name: string) => headers.indexOf(normalizeHeader(name));
  const missing = bindingTemplateHeaders.filter((name) => indexOf(name) < 0);
  if (missing.length) throw new Error(`模板表头不完整，缺少：${missing.join('、')}`);
  const rows = grid.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim()));
  if (!rows.length) throw new Error('模板中没有可导入的结算关系');
  const stores = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const textAt = (name: string) => String(row[indexOf(name)] ?? '').trim();
    const customer = textAt('客户名称');
    const store = textAt('店铺名称');
    const quote = textAt('报价名称');
    if (!customer || !store || !quote) throw new Error(`第 ${rowNumber} 行客户名称、店铺名称和报价名称均不能为空`);
    if (quote !== activeQuote) throw new Error(`第 ${rowNumber} 行报价名称必须与当前报价“${activeQuote}”一致`);
    if (stores.has(store)) throw new Error(`第 ${rowNumber} 行店铺“${store}”重复，同一店铺只能绑定一次`);
    stores.add(store);
    const prepaid = Number(row[indexOf('预付面单费(元)')]);
    if (!Number.isFinite(prepaid) || prepaid < 0) throw new Error(`第 ${rowNumber} 行预付面单费必须是大于或等于 0 的数字`);
    return { id: crypto.randomUUID(), customer, store, quote, prepaid };
  });
}

function formatCellDate(value: unknown) { if (value instanceof Date) return value.toISOString().slice(0, 10); return String(value ?? ''); }

function downloadCsv(name: string, rows: (string | number)[][]) {
  const escaped = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${escaped}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
