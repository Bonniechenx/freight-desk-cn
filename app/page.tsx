'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Boxes, Calculator, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert,
  Database, Download, FileClock, FileSpreadsheet, Folder, FolderPlus, LayoutDashboard, MapPin, PackageCheck, Plus,
  ReceiptText, Save, Search, ShieldCheck, Store,
  Trash2, Upload, Weight,
} from 'lucide-react';
import readXlsxFile, { readSheet } from 'read-excel-file/browser';

import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  calculateFreight, defaultPricing, defaultSurcharges, FeeResult,
  PricingConfig, ShipmentInput, SurchargeRule,
} from '@/lib/freight';
import {
  calculateWorkbookFreight, ImportedWorkbookQuote, parseWorkbookQuote, WorkbookSheet,
} from '@/lib/quote-workbook';
import {
  AppConfigSnapshot, BillRecord, deleteBillRecord, listBillRecords, loadAppConfig, saveAppConfig, saveBillRecord,
} from '@/lib/local-db';

type View = 'single' | 'batch' | 'quotes' | 'bindings' | 'records';
type Binding = { id: string; store: string; customer: string; quote: string; prepaid: number; matchKey?: string; conditions?: Record<string, string> };
type QuoteFolder = { id: string; name: string };

const UNFILED_FOLDER_ID = '__unfiled__';

const sampleShipments: ShipmentInput[] = [
  { trackingNo: 'YT20260915001', destination: '广东省深圳市', weight: 0.86, store: '森屿旗舰店', customer: '森屿电商', settlementKey: '森屿电商+森屿旗舰店', date: '2026-09-15' },
  { trackingNo: 'YT20260915002', destination: '浙江省杭州市', weight: 2.31, store: '森屿旗舰店', customer: '森屿电商', settlementKey: '森屿电商+森屿旗舰店', date: '2026-09-15' },
  { trackingNo: 'YT20260915003', destination: '北京市朝阳区', weight: 3.26, store: '北辰专营店', customer: '北辰商贸', settlementKey: '北辰商贸+北辰专营店', date: '2026-09-15' },
  { trackingNo: 'YT20260915004', destination: '新疆乌鲁木齐市', weight: 1.48, store: '云栈生活馆', customer: '云栈供应链', settlementKey: '云栈供应链+云栈生活馆', date: '2026-09-15' },
  { trackingNo: 'YT20260915005', destination: '江苏省苏州市', weight: 5.08, store: '北辰专营店', customer: '北辰商贸', settlementKey: '北辰商贸+北辰专营店', date: '2026-09-15' },
];
const initialBindings: Binding[] = [
  { id: 'b1', store: '森屿旗舰店', customer: '森屿电商', quote: '默认客户报价', prepaid: 0, matchKey: '森屿电商+森屿旗舰店' },
  { id: 'b2', store: '北辰专营店', customer: '北辰商贸', quote: '默认客户报价', prepaid: 1, matchKey: '北辰商贸+北辰专营店' },
  { id: 'b3', store: '云栈生活馆', customer: '云栈供应链', quote: '默认客户报价', prepaid: 2, matchKey: '云栈供应链+云栈生活馆' },
];

export default function Home() {
  const [view, setView] = useState<View>('single');
  const [pricing, setPricing] = useState<PricingConfig>(defaultPricing);
  const [surcharges, setSurcharges] = useState<SurchargeRule[]>(defaultSurcharges);
  const [bindings, setBindings] = useState<Binding[]>(initialBindings);
  const [workbookQuotes, setWorkbookQuotes] = useState<ImportedWorkbookQuote[]>([]);
  const [quoteFolders, setQuoteFolders] = useState<QuoteFolder[]>([]);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const indexed = await loadAppConfig<Record<string, unknown>>();
        const legacy = window.localStorage.getItem('freight-desk-config');
        const parsed = indexed ?? (legacy ? JSON.parse(legacy) : null);
        if (parsed && typeof parsed === 'object') {
          if (parsed.pricing) setPricing(parsed.pricing as PricingConfig);
          if (parsed.surcharges) setSurcharges(parsed.surcharges as SurchargeRule[]);
          if (parsed.bindings) setBindings((parsed.bindings as Binding[]).map(migrateBinding));
          if (Array.isArray(parsed.workbookQuotes)) setWorkbookQuotes(parsed.workbookQuotes as ImportedWorkbookQuote[]);
          else if (parsed.workbookQuote) setWorkbookQuotes([parsed.workbookQuote as ImportedWorkbookQuote]);
          if (Array.isArray(parsed.quoteFolders)) setQuoteFolders(parsed.quoteFolders as QuoteFolder[]);
        }
      } catch { /* ignore invalid local draft */ }
      finally { setHydrated(true); }
    })();
  }, []);

  const configSnapshot = useMemo<AppConfigSnapshot>(() => ({ pricing, surcharges, bindings, workbookQuotes, quoteFolders }), [pricing, surcharges, bindings, workbookQuotes, quoteFolders]);

  const saveConfig = () => {
    void saveAppConfig(configSnapshot);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => { void saveAppConfig(configSnapshot); }, 350);
    return () => window.clearTimeout(timer);
  }, [configSnapshot, hydrated]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[238px_minmax(0,1fr)]">
        <Sidebar view={view} setView={setView} />
        <main className="min-w-0">
          <Header view={view} saved={saved} saveConfig={saveConfig} />
          <MobileNav view={view} setView={setView} />
          <div className="mx-auto max-w-[1480px] p-4 md:p-8">
            <div className={view === 'single' ? '' : 'hidden'}><SingleCalculator pricing={pricing} surcharges={surcharges} workbookQuotes={workbookQuotes} bindings={bindings} goBatch={() => setView('batch')} /></div>
            <div className={view === 'batch' ? '' : 'hidden'}><BatchCalculator pricing={pricing} surcharges={surcharges} workbookQuotes={workbookQuotes} bindings={bindings} onRecordSaved={() => setHistoryRevision((value) => value + 1)} /></div>
            <div className={view === 'quotes' ? '' : 'hidden'}><QuoteEditor pricing={pricing} setPricing={setPricing} surcharges={surcharges} setSurcharges={setSurcharges} workbookQuotes={workbookQuotes} setWorkbookQuotes={setWorkbookQuotes} quoteFolders={quoteFolders} setQuoteFolders={setQuoteFolders} saveConfig={saveConfig} /></div>
            <div className={view === 'bindings' ? '' : 'hidden'}><BindingsEditor bindings={bindings} setBindings={setBindings} quoteNames={workbookQuotes.length ? workbookQuotes.map((quote) => quote.quoteName) : [pricing.quoteName]} /></div>
            <div className={view === 'records' ? '' : 'hidden'}><LocalDataCenter revision={historyRevision} config={configSnapshot} workbookQuotes={workbookQuotes} bindings={bindings} /></div>
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
        <NavItem icon={Store} label="多条件关系" active={view === 'bindings'} onClick={() => setView('bindings')} />
        <NavItem icon={Boxes} label="账单记录" active={view === 'records'} onClick={() => setView('records')} badge="本机" />
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
    bindings: ['规则中心 / 多条件关系', '管理条件组合与报价关系'],
    records: ['本机数据 / 账单记录', '查询、导出与备份'],
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
  const items: [View, string][] = [['single', '试算'], ['batch', '批量'], ['quotes', '报价'], ['bindings', '条件'], ['records', '记录']];
  return <div className="flex gap-2 overflow-x-auto border-b bg-white px-4 py-3 lg:hidden">{items.map(([id, label]) => <button key={id} onClick={() => setView(id)} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${view === id ? 'bg-[#0b213b] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div>;
}

function SingleCalculator({ pricing, surcharges, workbookQuotes, bindings, goBatch }: { pricing: PricingConfig; surcharges: SurchargeRule[]; workbookQuotes: ImportedWorkbookQuote[]; bindings: Binding[]; goBatch: () => void }) {
  const [destination, setDestination] = useState('广东省深圳市');
  const [weight, setWeight] = useState('3.26');
  const [bindingId, setBindingId] = useState(bindings[0]?.id ?? '');
  const [rateCondition, setRateCondition] = useState('');
  const [date, setDate] = useState('2026-09-15');
  const binding = bindings.find((item) => item.id === bindingId) ?? bindings[0];
  const matchedWorkbookQuote = binding ? findWorkbookQuote(workbookQuotes, binding.quote) : workbookQuotes[0];
  const workbookQuote = matchedWorkbookQuote ?? (workbookQuotes.length === 1 && binding?.quote === pricing.quoteName ? workbookQuotes[0] : undefined);
  const activeQuoteName = workbookQuote?.quoteName ?? binding?.quote ?? pricing.quoteName;
  const result = useMemo(() => {
    const input: ShipmentInput = { trackingNo: '单票试算', destination, weight: Number(weight), quotePlan: activeQuoteName, customer: binding?.customer, store: binding?.store, settlementKey: binding ? getBindingKey(binding) : '', rateCondition, date };
    if (binding && workbookQuotes.length && !workbookQuote) return feeError(input, activeQuoteName, `条件组合已指定报价“${activeQuoteName}”，但该报价尚未导入`);
    return workbookQuote ? calculateWorkbookFreight(input, workbookQuote, binding?.prepaid ?? 0) : calculateFreight(input, pricing, surcharges, binding?.prepaid ?? 0);
  }, [destination, weight, rateCondition, date, pricing, surcharges, workbookQuote, workbookQuotes.length, binding, activeQuoteName]);

  return (
    <>
      <PageIntro eyebrow={`${activeQuoteName} · 当前生效`} title="输入计费条件，立即解释价格" description="先按结算条件组合值确定报价表，再匹配物流公司或渠道、生效日期、目的地、公斤段和加收费。" action={<Button onClick={goBatch} className="h-10 bg-[#0d7f75] px-4 text-white hover:bg-[#0a6d65]">进入批量核算 <ChevronRight /></Button>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
        <Panel title="计费条件" description={workbookQuote ? `${workbookQuote.periods.length || 1} 个生效期，${workbookQuote.bandLabels.length} 个表头公斤段` : `首重 ${pricing.firstWeight}kg / ¥${pricing.firstPrice}，续重 ${pricing.continuedStep}kg / ¥${pricing.continuedPrice}`}>
          <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
            <Field label="目的地（省 / 市）" icon={MapPin}><Input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="例如：广东省深圳市" className="h-11 bg-white" /></Field>
            <Field label="实际重量" icon={Weight}><InputWithUnit value={weight} setValue={setWeight} unit="kg" /></Field>
            <Field label="结算条件组合" icon={Store}><NativeSelect value={binding?.id ?? ''} onChange={(event) => setBindingId(event.target.value)} className="h-11 bg-white">{bindings.map((item) => <NativeSelectOption key={item.id} value={item.id}>{formatBindingConditions(item)}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="物流公司 / 报价条件" icon={Boxes}><Input value={rateCondition} onChange={(event) => setRateCondition(event.target.value)} placeholder="例如：九象圆通拼多多0-2" className="h-11 bg-white" /></Field>
            <Field label="发货日期" icon={FileSpreadsheet}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-11 bg-white" /></Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50/70 px-5 py-4 text-xs text-muted-foreground md:px-6"><span>{workbookQuote ? `按报价表头自动识别阶梯价与续重方式` : `计费重量按 ${pricing.continuedStep}kg ${roundingText(pricing.rounding)}`}</span><span className="font-mono">报价 · {activeQuoteName}</span></div>
        </Panel>
        <ResultCard result={result} />
      </div>
      <section className="mt-5 grid gap-4 md:grid-cols-3"><Metric label="示例账单" value="5" unit="票" trend="可直接试用" /><Metric label="已导入报价" value={String(workbookQuotes.length || 1)} unit="份" trend={workbookQuotes.length ? '按条件选择' : '手工报价'} /><Metric label="条件组合" value={String(bindings.length)} unit="条" trend="本机保存" /></section>
    </>
  );
}

type BatchColumnMapping = {
  destinationColumns: string[];
  weight: string;
  quotePlan: string;
  rateCondition: string;
  trackingNo: string;
  store: string;
  date: string;
  settlementColumns: string[];
};

type PendingBatchImport = {
  fileName: string;
  grid: unknown[][];
  headerRow: number;
};

function calculateBatchRows(rows: ShipmentInput[], pricing: PricingConfig, surcharges: SurchargeRule[], workbookQuotes: ImportedWorkbookQuote[], bindings: Binding[]) {
  return rows.map((row) => {
    const resolved = resolveBinding(bindings, row.settlementKey || legacySettlementKey(row));
    if (bindings.length && resolved.error) return feeError(row, row.quotePlan || '未匹配报价', `原表第 ${row.sourceRow ?? '—'} 行${resolved.error}`);
    const binding = resolved.binding;
    if (binding && row.quotePlan && !quoteNamesMatch(row.quotePlan, binding.quote)) return feeError(row, binding.quote, `账单报价“${row.quotePlan}”与条件组合指定报价“${binding.quote}”不一致`, binding.prepaid);
    const bindingQuote = binding?.quote || row.quotePlan || (workbookQuotes.length === 1 ? workbookQuotes[0].quoteName : pricing.quoteName);
    const workbookQuote = findWorkbookQuote(workbookQuotes, bindingQuote) ?? (workbookQuotes.length === 1 && bindingQuote === pricing.quoteName ? workbookQuotes[0] : undefined);
    const requestedQuote = workbookQuote?.quoteName ?? bindingQuote;
    if (workbookQuotes.length && !workbookQuote) return feeError(row, requestedQuote, `条件组合指定报价“${requestedQuote}”，但该报价尚未导入`, binding?.prepaid ?? 0);
    const calculatedInput = { ...row, quotePlan: requestedQuote, customer: row.customer || binding?.customer, store: row.store || binding?.store };
    return workbookQuote ? calculateWorkbookFreight(calculatedInput, workbookQuote, binding?.prepaid ?? 0) : calculateFreight(calculatedInput, pricing, surcharges, binding?.prepaid ?? 0);
  });
}

function BatchCalculator({ pricing, surcharges, workbookQuotes, bindings, onRecordSaved }: { pricing: PricingConfig; surcharges: SurchargeRule[]; workbookQuotes: ImportedWorkbookQuote[]; bindings: Binding[]; onRecordSaved: () => void }) {
  const [rows, setRows] = useState<ShipmentInput[]>(sampleShipments);
  const [fileName, setFileName] = useState('示例账单.xlsx');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('已载入示例数据，可直接查看计算结果');
  const [mappingError, setMappingError] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingBatchImport | null>(null);
  const [originalImport, setOriginalImport] = useState<PendingBatchImport | null>(null);
  const [mapping, setMapping] = useState<BatchColumnMapping>(() => emptyBatchMapping());
  const fileRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => calculateBatchRows(rows, pricing, surcharges, workbookQuotes, bindings), [rows, pricing, surcharges, workbookQuotes, bindings]);
  const filtered = results.filter((row) => [row.trackingNo, row.destination, row.store, row.customer, row.quotePlan, row.rateCondition, row.settlementKey].some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase())));
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

  const applyMapping = async () => {
    if (!pendingImport) return;
    const requiresRateCondition = workbookQuotes.some((quote) => (quote.conditionLabels?.length ?? 0) > 0);
    const requiresDate = workbookQuotes.some((quote) => (quote.periods?.length ?? 0) > 0);
    const requiresQuotePlan = bindings.length === 0;
    const required = [mapping.weight, ...(requiresQuotePlan ? [mapping.quotePlan] : []), ...(requiresRateCondition ? [mapping.rateCondition] : []), ...(requiresDate ? [mapping.date] : [])];
    if (!mapping.destinationColumns.length || required.some((value) => value === '')) {
      const extras = [requiresQuotePlan ? '报价方案' : '', requiresRateCondition ? '物流公司/报价条件' : '', requiresDate ? '发货日期' : ''].filter(Boolean).join('、');
      setMappingError(`请先选择目的地、重量${extras ? `、${extras}` : ''}列`);
      return;
    }
    if (bindings.length && !mapping.settlementColumns.length) {
      setMappingError('请在一个选项框中至少选择一列结算条件');
      return;
    }
    if (mapping.destinationColumns.includes(mapping.weight)) {
      setMappingError('目的地组合列和重量不能选择同一列');
      return;
    }
    const parsed = gridToMappedShipments(pendingImport.grid, pendingImport.headerRow, mapping);
    if (!parsed.length) {
      setMappingError('所选列下方没有可导入的数据');
      return;
    }
    const calculated = calculateBatchRows(parsed, pricing, surcharges, workbookQuotes, bindings);
    setRows(parsed);
    setFileName(pendingImport.fileName);
    try {
      await saveBillRecord({
        id: crypto.randomUUID(), fileName: pendingImport.fileName, createdAt: new Date().toISOString(),
        rowCount: calculated.length, total: calculated.reduce((sum, row) => sum + row.total, 0),
        errorCount: calculated.filter((row) => row.status === 'error').length, results: calculated,
        originalGrid: pendingImport.grid, headerRow: pendingImport.headerRow,
      });
      onRecordSaved();
      setMessage(`已计算 ${parsed.length} 条并自动保存到“账单记录”`);
    } catch {
      setMessage(`已计算 ${parsed.length} 条；本机记录保存失败，请先导出 CSV`);
    }
    setMappingError('');
    setOriginalImport(pendingImport);
    setPendingImport(null);
  };

  const download = () => {
    if (originalImport) exportOriginalWithResultsCsv('运费核算结果.csv', originalImport.grid, originalImport.headerRow, results);
    else exportResultsCsv('运费核算结果.csv', results);
  };

  return (
    <>
      <PageIntro eyebrow="任意表头均可导入" title="上传账单后，由你指定计费列" description="在一个选项框中按顺序选择多个结算列，系统会把每行的列值组合后匹配报价；随后再按报价内部条件、日期、目的地和重量计算。" action={<><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importFile} /><Button onClick={() => fileRef.current?.click()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Upload />{loading ? '正在读取' : '导入账单'}</Button></>} />
      {pendingImport && <section className="mb-5 overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-[0_14px_44px_rgba(15,23,42,.06)]">
        <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/70 p-5 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold text-teal-700">已读取原始账单</p><h3 className="mt-1 font-semibold">{pendingImport.fileName}</h3><p className="mt-1 text-xs text-muted-foreground">原表不会被修改。报价方案值会与“报价管理”中已启用的报价匹配。</p></div><Button variant="ghost" onClick={() => setPendingImport(null)}>取消本次导入</Button></div>
        <div className="grid gap-4 p-5 lg:grid-cols-4">
          <MappingSelect label="表头所在行" value={String(pendingImport.headerRow)} setValue={changeHeaderRow} options={headerCandidates.map((item) => ({ value: String(item.index), label: item.label }))} />
          <OrderedMultiColumnSelect required label="目的地组合列（省 → 市 → 区）" values={mapping.destinationColumns} setValues={(values) => setMapping({ ...mapping, destinationColumns: values })} options={columnOptions} dialogTitle="按顺序选择目的地列" dialogDescription="可只选一个完整地址列，也可依次选择省、市、区三列。" hint="系统会把所选列合并为完整目的地，并优先匹配区级，其次市级，最后省级报价。" joinText=" → " />
          <MappingSelect required label="重量列" value={mapping.weight} setValue={(value) => setMapping({ ...mapping, weight: value })} options={columnOptions} />
          <MappingSelect required={bindings.length === 0} label={`报价方案列${bindings.length ? '（可选校验）' : ''}`} value={mapping.quotePlan} setValue={(value) => setMapping({ ...mapping, quotePlan: value })} options={columnOptions} optional={bindings.length > 0} />
          <OrderedMultiColumnSelect required={bindings.length > 0} label="结算组合列（按选择顺序匹配）" values={mapping.settlementColumns} setValues={(values) => setMapping({ ...mapping, settlementColumns: values })} options={columnOptions} />
          <MappingSelect required={workbookQuotes.some((quote) => (quote.conditionLabels?.length ?? 0) > 0)} label="物流公司 / 报价条件列" value={mapping.rateCondition} setValue={(value) => setMapping({ ...mapping, rateCondition: value })} options={columnOptions} optional={!workbookQuotes.some((quote) => (quote.conditionLabels?.length ?? 0) > 0)} />
          <MappingSelect label="运单号列（可选）" value={mapping.trackingNo} setValue={(value) => setMapping({ ...mapping, trackingNo: value })} options={columnOptions} optional />
          <MappingSelect label="店铺列（可选）" value={mapping.store} setValue={(value) => setMapping({ ...mapping, store: value })} options={columnOptions} optional />
          <MappingSelect required={workbookQuotes.some((quote) => (quote.periods?.length ?? 0) > 0)} label={`发货日期列${workbookQuotes.some((quote) => (quote.periods?.length ?? 0) > 0) ? '' : '（可选）'}`} value={mapping.date} setValue={(value) => setMapping({ ...mapping, date: value })} options={columnOptions} optional={!workbookQuotes.some((quote) => (quote.periods?.length ?? 0) > 0)} />
          <div className="flex items-end"><Button onClick={applyMapping} className="h-10 w-full bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Calculator />按所选列开始计算</Button></div>
        </div>
        {mappingError && <div className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700"><CircleAlert className="mr-2 inline size-4" />{mappingError}</div>}
        <div className="overflow-x-auto border-t"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>原表行</TableHead><TableHead>目的地预览</TableHead><TableHead>重量预览</TableHead><TableHead>组合值预览</TableHead><TableHead>报价条件预览</TableHead></TableRow></TableHeader><TableBody>{previewRows.map((item) => <TableRow key={item.sourceRow}><TableCell className="text-muted-foreground">{item.sourceRow}</TableCell><TableCell>{mapping.destinationColumns.length ? combineDestinationValues(mapping.destinationColumns.map((column) => cellText(item.row[Number(column)]))) : <span className="text-amber-600">请选择目的地列</span>}</TableCell><TableCell>{cellPreview(item.row, mapping.weight)}</TableCell><TableCell>{mapping.settlementColumns.length ? combineSettlementValues(mapping.settlementColumns.map((column) => cellText(item.row[Number(column)]))) || <span className="text-muted-foreground">空白</span> : <span className="text-amber-600">请选择组合列</span>}</TableCell><TableCell>{cellPreview(item.row, mapping.rateCondition)}</TableCell></TableRow>)}</TableBody></Table></div>
      </section>}
      <section className="grid gap-4 md:grid-cols-3"><Metric label="账单行数" value={String(results.length)} unit="票" trend={fileName} /><Metric label="预计应收" value={`¥${total.toFixed(2)}`} unit="" trend="逐票汇总" /><Metric label="异常待复核" value={String(errors)} unit="票" trend={errors ? '请检查原始列' : '全部通过'} warning={errors > 0} /></section>
      <section className="mt-5 overflow-hidden rounded-2xl border bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <div><h3 className="font-semibold">{fileName}</h3><p className="mt-1 text-xs text-muted-foreground">{message}</p></div>
          <div className="flex gap-2"><div className="relative min-w-0 flex-1 md:w-64"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索运单、地区或店铺" className="pl-8" /></div><Button variant="outline" onClick={download}><Download />导出 CSV</Button></div>
        </div>
        <Table>
          <TableHeader><TableRow className="bg-slate-50"><TableHead>运单号</TableHead><TableHead>目的地</TableHead><TableHead>结算组合值</TableHead><TableHead>所用报价</TableHead><TableHead>报价内部条件</TableHead><TableHead className="text-right">原重 / 计费重</TableHead><TableHead className="text-right">基础费</TableHead><TableHead>加收费明细</TableHead><TableHead className="text-right">附加费</TableHead><TableHead className="text-right">抵扣</TableHead><TableHead className="text-right">合计</TableHead><TableHead>状态</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((row, index) => <TableRow key={`${row.trackingNo}-${index}`} title={row.explanation}><TableCell className="font-mono text-xs">{row.trackingNo}</TableCell><TableCell>{row.destination}</TableCell><TableCell className="max-w-72 text-xs text-muted-foreground">{row.settlementKey || '—'}</TableCell><TableCell>{row.quoteName}</TableCell><TableCell>{row.rateCondition || '—'}</TableCell><TableCell className="text-right"><span className="text-muted-foreground">{row.weight}</span><ArrowRight className="mx-1 inline size-3" />{row.roundedWeight}</TableCell><TableCell className="text-right">¥{row.baseFee.toFixed(2)}</TableCell><TableCell className="max-w-72 text-xs text-muted-foreground">{formatSurchargeDetails(row)}</TableCell><TableCell className="text-right">¥{row.surcharge.toFixed(2)}</TableCell><TableCell className="text-right text-amber-700">-¥{row.prepaid.toFixed(2)}</TableCell><TableCell className="text-right font-semibold">¥{row.total.toFixed(2)}</TableCell><TableCell>{row.status === 'ok' ? <Status ok>成功</Status> : <Status>异常</Status>}</TableCell></TableRow>)}</TableBody>
        </Table>
        {!filtered.length && <div className="p-10 text-center text-sm text-muted-foreground">没有符合搜索条件的账单</div>}
      </section>
      <p className="mt-3 text-xs text-muted-foreground">无需固定表头。导出时保留原始表格的全部列，并在最右侧追加报价、计费重量、各项加收费、合计与计算说明。</p>
    </>
  );
}

function QuoteEditor({ pricing, setPricing, surcharges, setSurcharges, workbookQuotes, setWorkbookQuotes, quoteFolders, setQuoteFolders, saveConfig }: { pricing: PricingConfig; setPricing: (value: PricingConfig) => void; surcharges: SurchargeRule[]; setSurcharges: (value: SurchargeRule[]) => void; workbookQuotes: ImportedWorkbookQuote[]; setWorkbookQuotes: (value: ImportedWorkbookQuote[]) => void; quoteFolders: QuoteFolder[]; setQuoteFolders: (value: QuoteFolder[]) => void; saveConfig: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState(UNFILED_FOLDER_ID);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const updateNumber = (key: keyof PricingConfig, value: string) => setPricing({ ...pricing, [key]: Number(value) || 0 });
  const updateRule = (id: string, patch: Partial<SurchargeRule>) => setSurcharges(surcharges.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addRule = () => setSurcharges([...surcharges, { id: crypto.randomUUID(), name: '新附加费', destinations: ['海南'], mode: 'ticket', amount: 1, enabled: true }]);
  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name || quoteFolders.some((folder) => folder.name.toLowerCase() === name.toLowerCase())) return;
    const folder = { id: crypto.randomUUID(), name };
    setQuoteFolders([...quoteFolders, folder]);
    setTargetFolderId(folder.id);
    setNewFolderName('');
    setShowNewFolder(false);
    setImportError(false);
    setImportMessage(`已新建文件夹“${name}”，下一份报价将导入到这里`);
  };
  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage('');
    try {
      const sheets = await readXlsxFile(file);
      const imported = { ...parseWorkbookQuote(file.name, sheets as WorkbookSheet[]), folderId: targetFolderId === UNFILED_FOLDER_ID ? undefined : targetFolderId };
      setWorkbookQuotes([...workbookQuotes.filter((quote) => !quoteNamesMatch(quote.quoteName, imported.quoteName)), imported]);
      setImportError(false);
      const folderName = quoteFolders.find((folder) => folder.id === targetFolderId)?.name ?? '未分类';
      setImportMessage(`已将“${imported.quoteName}”加入“${folderName}”：${imported.baseRules.length} 条基础费用、${imported.extraRules.length} 条加收费`);
    } catch (error) {
      setImportError(true);
      setImportMessage(error instanceof Error ? error.message : '运费宝报价解析失败');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };
  const folderGroups = [
    ...quoteFolders.map((folder) => ({ ...folder, quotes: workbookQuotes.filter((quote) => quote.folderId === folder.id) })),
    { id: UNFILED_FOLDER_ID, name: '未分类', quotes: workbookQuotes.filter((quote) => !quote.folderId || !quoteFolders.some((folder) => folder.id === quote.folderId)) },
  ].filter((folder) => folder.id !== UNFILED_FOLDER_ID || folder.quotes.length > 0 || quoteFolders.length === 0);
  return (
    <>
      <PageIntro eyebrow={`${workbookQuotes.length} 份报价 · ${quoteFolders.length} 个文件夹`} title="按文件夹管理运费宝报价" description="导入前先选择目标文件夹，也可以现场新建；展开文件夹后再查看其中的报价与规则。" action={<div className="flex flex-wrap gap-2"><input ref={fileRef} className="hidden" type="file" accept=".xlsx" onChange={importTemplate} /><NativeSelect value={targetFolderId} onChange={(event) => setTargetFolderId(event.target.value)} className="h-10 min-w-40 bg-white"><NativeSelectOption value={UNFILED_FOLDER_ID}>导入到：未分类</NativeSelectOption>{quoteFolders.map((folder) => <NativeSelectOption key={folder.id} value={folder.id}>导入到：{folder.name}</NativeSelectOption>)}</NativeSelect><Button variant="outline" onClick={() => setShowNewFolder((value) => !value)} className="h-10"><FolderPlus />新建文件夹</Button><Button variant="outline" onClick={() => fileRef.current?.click()} className="h-10"><Upload />{importing ? '正在识别' : '导入报价'}</Button><Button onClick={saveConfig} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Save />保存报价</Button></div>} />
      {showNewFolder && <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:flex-row sm:items-end"><TextControl label="新文件夹名称" value={newFolderName} setValue={setNewFolderName} placeholder="例如：壹令云仓-成本" /><Button onClick={createFolder} disabled={!newFolderName.trim()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><FolderPlus />创建并选中</Button><Button variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="h-10">取消</Button></section>}
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"><MapPin className="mt-0.5 size-5 shrink-0 text-sky-600" /><div><p className="font-semibold">目的地层级与加收费已自动识别</p><p className="mt-1 text-xs leading-5 text-sky-800">推荐在报价中写完整名称（广东省、深圳市、南山区）。没有后缀时可写“省:广东 / 市:深圳 / 区:南山”；原有“【深圳】”也按市级特殊规则识别。计算时按区 → 市 → 省选择最具体规则。“加收费用”Sheet 会按目的地、物流条件、生效日期和重量规则叠加。</p></div></div>
      {workbookQuotes.length || quoteFolders.length ? <section className="mb-5 overflow-hidden rounded-2xl border bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]"><Accordion defaultValue={[folderGroups[0]?.id]}>{folderGroups.map((folder) => <QuoteFolderGroup key={folder.id} folder={folder} quoteFolders={quoteFolders} onMoveQuote={(quoteName, folderId) => setWorkbookQuotes(workbookQuotes.map((quote) => quote.quoteName === quoteName ? { ...quote, folderId: folderId === UNFILED_FOLDER_ID ? undefined : folderId } : quote))} onRemoveQuote={(quoteName) => setWorkbookQuotes(workbookQuotes.filter((quote) => quote.quoteName !== quoteName))} onRemoveFolder={() => { setQuoteFolders(quoteFolders.filter((item) => item.id !== folder.id)); if (targetFolderId === folder.id) setTargetFolderId(UNFILED_FOLDER_ID); }} />)}</Accordion></section> : <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"><FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-sky-600" /><div><p className="font-semibold">先建文件夹，再导入报价</p><p className="mt-1 text-xs leading-5 text-sky-800">也可以直接导入到“未分类”，之后再把报价移动到新文件夹。</p></div></div>}
      {importMessage && <div className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${importError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{importError ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}<span>{importMessage}</span></div>}
      {!workbookQuotes.length && <><div className="mb-3"><h3 className="font-semibold">手工报价</h3><p className="mt-1 text-xs text-muted-foreground">没有现成运费宝文件时，可用这组简化规则试算。</p></div>
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

function QuoteFolderGroup({ folder, quoteFolders, onMoveQuote, onRemoveQuote, onRemoveFolder }: { folder: QuoteFolder & { quotes: ImportedWorkbookQuote[] }; quoteFolders: QuoteFolder[]; onMoveQuote: (quoteName: string, folderId: string) => void; onRemoveQuote: (quoteName: string) => void; onRemoveFolder: () => void }) {
  return <AccordionItem value={folder.id} className="px-4 md:px-5">
    <AccordionTrigger className="py-4 hover:no-underline"><div className="flex min-w-0 items-center gap-3"><Folder className="size-5 shrink-0 fill-sky-100 text-sky-600" /><div className="min-w-0"><p className="truncate font-semibold">{folder.name}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{folder.quotes.length} 份报价</p></div></div></AccordionTrigger>
    <AccordionContent className="pb-5">
      {folder.id !== UNFILED_FOLDER_ID && <div className="mb-3 flex justify-end"><Button variant="ghost" size="sm" disabled={folder.quotes.length > 0} title={folder.quotes.length ? '请先移动或移除文件夹中的报价' : '删除空文件夹'} onClick={onRemoveFolder}><Trash2 className="text-rose-600" />删除空文件夹</Button></div>}
      {folder.quotes.length ? <div className="overflow-hidden rounded-xl border bg-slate-50/50"><Accordion defaultValue={[folder.quotes[0].quoteName]}>{folder.quotes.map((quote) => <AccordionItem key={quote.quoteName} value={quote.quoteName} className="px-4"><AccordionTrigger className="py-3 hover:no-underline"><div className="flex min-w-0 items-center gap-3"><FileSpreadsheet className="size-4 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="truncate font-medium">{quote.quoteName}</p><p className="mt-1 truncate text-xs font-normal text-muted-foreground">{quote.sourceFile} · 基础 {quote.baseRules.length} 条 · 加收 {quote.extraRules.length} 条</p></div></div></AccordionTrigger><AccordionContent className="pb-4"><div className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-4" />报价已启用</div><div className="flex flex-wrap items-end gap-2"><label className="space-y-1"><span className="block text-[11px] font-semibold text-slate-500">所属文件夹</span><NativeSelect value={quote.folderId ?? UNFILED_FOLDER_ID} onChange={(event) => onMoveQuote(quote.quoteName, event.target.value)} className="h-9 min-w-36"><NativeSelectOption value={UNFILED_FOLDER_ID}>未分类</NativeSelectOption>{quoteFolders.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></label><Button variant="outline" size="sm" onClick={() => { if (window.confirm(`确定删除报价“${quote.quoteName}”吗？删除后使用它的结算关系将无法计算。`)) onRemoveQuote(quote.quoteName); }}><Trash2 className="text-rose-600" />删除报价</Button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><CompactMetric label="基础费用" value={`${quote.baseRules.length} 条`} /><CompactMetric label="加收费用" value={`${quote.extraRules.length} 条`} /><CompactMetric label="物流条件" value={`${quote.conditionLabels?.length ?? 0} 种`} /><CompactMetric label="生效期" value={`${quote.periods.length || 1} 个`} /></div><div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-3"><QuoteTagGroup label="已识别工作表" values={quote.detectedSheets} /><QuoteTagGroup label="物流公司 / 报价条件" values={quote.conditionLabels ?? []} accent /><QuoteTagGroup label="加收费用明细" values={quote.extraRules.map((rule) => rule.name)} accent /></div>{quote.warnings.length > 0 && <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{quote.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}</div></AccordionContent></AccordionItem>)}</Accordion></div> : <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center text-sm text-muted-foreground">这个文件夹还是空的。请在页面上方选中它，再导入报价。</div>}
    </AccordionContent>
  </AccordionItem>;
}

function BindingsEditor({ bindings, setBindings, quoteNames }: { bindings: Binding[]; setBindings: (value: Binding[]) => void; quoteNames: string[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState({ matchKey: '', quote: quoteNames[0] ?? '', prepaid: '0' });
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState(false);
  const [importing, setImporting] = useState(false);
  const add = () => {
    const matchKey = cleanSettlementKey(draft.matchKey);
    if (!matchKey || bindings.some((binding) => settlementKeysEqual(getBindingKey(binding), matchKey))) return;
    setBindings([...bindings, { id: crypto.randomUUID(), store: '', customer: '', quote: draft.quote || quoteNames[0] || '', prepaid: Number(draft.prepaid) || 0, matchKey }]);
    setDraft({ matchKey: '', quote: draft.quote || quoteNames[0] || '', prepaid: '0' });
  };
  const downloadTemplate = () => {
    const rows = bindings.length ? bindings.map((item) => [getBindingKey(item), item.quote, item.prepaid]) : [['示例客户+示例旗舰店', quoteNames[0] ?? '', 0]];
    downloadCsv('组合值报价结算关系模板.csv', [['结算条件组合值', '所用报价', '预付面单费'], ...rows]);
  };
  const importTemplate = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMessage('');
    try {
      const grid = file.name.toLowerCase().endsWith('.csv') ? parseCsv(await file.text()) : await readSheet(file);
      const imported = parseBindingTemplate(grid, quoteNames);
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
      <PageIntro eyebrow="组合值完全一致才选择报价" title="按选列顺序维护报价关系" description="批量账单按你选择列的先后顺序生成组合值。例如先选 A、再选 B，就用 A值+B值匹配模板中的同一列。" action={<div className="flex flex-wrap gap-2"><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={importTemplate} /><Button variant="outline" onClick={downloadTemplate} className="h-10"><Download />下载组合值模板</Button><Button onClick={() => fileRef.current?.click()} className="h-10 bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Upload />{importing ? '正在导入' : '导入组合值关系'}</Button></div>} />
      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900">
        <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-sky-600" />
        <div><p className="font-semibold">组合值模板规则</p><p className="mt-1 text-xs leading-5 text-sky-800">模板固定为“结算条件组合值、所用报价、预付面单费”三列。组合值的顺序必须与批量核算页的选列顺序一致。旧版多条件模板仍可导入，系统会按原表从左到右自动合并。</p></div>
      </div>
      {importMessage && <div className={`mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${importError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{importError ? <CircleAlert className="size-4" /> : <CheckCircle2 className="size-4" />}<span>{importMessage}</span></div>}
      <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel title="快速新增组合值" description="多个值用 + 连接，顺序与账单选列一致">
          <div className="space-y-4 p-5">
            <TextControl label="结算条件组合值" value={draft.matchKey} setValue={(value) => setDraft({ ...draft, matchKey: value })} placeholder="例如：森屿电商+森屿抖音店" />
            <label className="space-y-2"><span className="text-xs font-semibold text-slate-600">所用报价</span><NativeSelect value={draft.quote} onChange={(event) => setDraft({ ...draft, quote: event.target.value })} className="h-10">{quoteNames.map((name) => <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>)}</NativeSelect></label>
            <NumberControl label="预付面单费" value={draft.prepaid} setValue={(value) => setDraft({ ...draft, prepaid: value })} unit="元" />
            <Button onClick={add} className="h-10 w-full bg-[#0d7f75] text-white hover:bg-[#0a6d65]"><Plus />添加绑定</Button>
          </div>
        </Panel>
        <Panel title="组合匹配关系" description={`${bindings.length} 条规则，按报价分组展开`}>
          <Accordion defaultValue={quoteNames.slice(0, 1)}>{quoteNames.map((quoteName) => { const quoteBindings = bindings.filter((binding) => quoteNamesMatch(binding.quote, quoteName)); return <AccordionItem key={quoteName} value={quoteName} className="px-4"><AccordionTrigger className="py-4 hover:no-underline"><div className="flex items-center gap-3"><Folder className="size-5 text-sky-600" /><div><p className="font-semibold">{quoteName}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{quoteBindings.length} 条结算组合</p></div></div></AccordionTrigger><AccordionContent className="pb-4"><div className="overflow-hidden rounded-xl border"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>结算条件组合值</TableHead><TableHead className="text-right">面单抵扣</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{quoteBindings.map((item) => <TableRow key={item.id}><TableCell><span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{getBindingKey(item)}</span></TableCell><TableCell className="text-right">¥{item.prepaid.toFixed(2)}</TableCell><TableCell><Button variant="ghost" size="icon-sm" aria-label="删除绑定" onClick={() => setBindings(bindings.filter((binding) => binding.id !== item.id))}><Trash2 className="text-rose-600" /></Button></TableCell></TableRow>)}</TableBody></Table>{!quoteBindings.length && <div className="p-5 text-center text-xs text-muted-foreground">这个报价暂时没有结算组合</div>}</div></AccordionContent></AccordionItem>; })}</Accordion>
        </Panel>
      </section>
    </>
  );
}

function LocalDataCenter({ revision, config, workbookQuotes, bindings }: { revision: number; config: AppConfigSnapshot; workbookQuotes: ImportedWorkbookQuote[]; bindings: Binding[] }) {
  const [records, setRecords] = useState<BillRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listBillRecords().then(setRecords).catch(() => setRecords([])).finally(() => setLoading(false));
  }, [revision]);

  const keyword = search.trim().toLowerCase();
  const filteredRecords = records.filter((record) => !keyword || record.fileName.toLowerCase().includes(keyword) || record.results.some((row) => [row.trackingNo, row.destination, row.store, row.customer, row.quoteName, row.settlementKey].some((value) => String(value ?? '').toLowerCase().includes(keyword))));
  const removeRecord = async (record: BillRecord) => {
    if (!window.confirm(`确定删除“${record.fileName}”这次核算记录吗？`)) return;
    await deleteBillRecord(record.id);
    setRecords((current) => current.filter((item) => item.id !== record.id));
  };
  const backup = () => downloadJson(`运费核算台本机备份-${new Date().toISOString().slice(0, 10)}.json`, { exportedAt: new Date().toISOString(), config, billRecords: records });

  return <>
    <PageIntro eyebrow="当前浏览器 · IndexedDB" title="本机数据与账单记录" description="每次完成批量计算都会自动留档。可按文件、运单、地区、客户或报价搜索，并可再次导出。" action={<Button variant="outline" onClick={backup}><Download />导出本机备份</Button>} />
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"><Database className="mt-0.5 size-5 shrink-0 text-sky-600" /><div><p className="font-semibold">数据存放位置说明</p><p className="mt-1 text-xs leading-5 text-sky-800">数据保存在当前浏览器的网站数据（IndexedDB）中，不会显示成 Finder 里的普通文件夹，也不会上传业务数据。清除浏览器网站数据前，请先点击“导出本机备份”。</p></div></div>
    <section className="mb-5 grid gap-4 md:grid-cols-3"><Metric label="账单记录" value={String(records.length)} unit="次" trend="自动留档" /><Metric label="报价配置" value={String(workbookQuotes.length)} unit="份" trend="本机数据库" /><Metric label="结算关系" value={String(bindings.length)} unit="条" trend="自动保存" /></section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-[0_14px_44px_rgba(15,23,42,.05)]">
      <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:px-5"><div><h3 className="font-semibold">历史核算文件</h3><p className="mt-1 text-xs text-muted-foreground">像文件夹一样展开查看，可随时重新导出</p></div><div className="relative md:w-80"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文件、运单、地区、客户或报价" className="pl-8" /></div></div>
      {loading ? <div className="p-10 text-center text-sm text-muted-foreground">正在读取本机记录…</div> : filteredRecords.length ? <Accordion>{filteredRecords.map((record) => <AccordionItem key={record.id} value={record.id} className="px-4 md:px-5"><AccordionTrigger className="py-4 hover:no-underline"><div className="flex min-w-0 items-center gap-3"><Folder className="size-5 shrink-0 text-sky-600" /><div className="min-w-0"><p className="truncate font-semibold">{record.fileName}</p><p className="mt-1 text-xs font-normal text-muted-foreground">{formatLocalDateTime(record.createdAt)} · {record.rowCount} 票 · ¥{record.total.toFixed(2)} · {record.errorCount} 条异常</p></div></div></AccordionTrigger><AccordionContent className="pb-5"><div className="mb-3 flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => record.originalGrid && record.headerRow !== undefined ? exportOriginalWithResultsCsv(`${record.fileName.replace(/\.(xlsx|xls|csv)$/i, '')}-运费核算结果.csv`, record.originalGrid, record.headerRow, record.results) : exportResultsCsv(`${record.fileName.replace(/\.(xlsx|xls|csv)$/i, '')}-运费核算结果.csv`, record.results)}><Download />导出原表 + 结果</Button><Button variant="outline" size="sm" onClick={() => void removeRecord(record)}><Trash2 className="text-rose-600" />删除记录</Button></div><div className="max-h-[460px] overflow-auto rounded-xl border"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>运单号</TableHead><TableHead>目的地</TableHead><TableHead>所用报价</TableHead><TableHead>加收费明细</TableHead><TableHead className="text-right">合计</TableHead><TableHead>状态</TableHead></TableRow></TableHeader><TableBody>{record.results.map((row, index) => <TableRow key={`${row.trackingNo}-${index}`}><TableCell className="font-mono text-xs">{row.trackingNo}</TableCell><TableCell>{row.destination}</TableCell><TableCell>{row.quoteName}</TableCell><TableCell className="text-xs text-muted-foreground">{formatSurchargeDetails(row)}</TableCell><TableCell className="text-right font-semibold">¥{row.total.toFixed(2)}</TableCell><TableCell>{row.status === 'ok' ? <Status ok>成功</Status> : <Status>异常</Status>}</TableCell></TableRow>)}</TableBody></Table></div></AccordionContent></AccordionItem>)}</Accordion> : <div className="p-12 text-center"><FileClock className="mx-auto size-8 text-slate-300" /><p className="mt-3 text-sm font-medium">{search ? '没有符合条件的历史记录' : '还没有保存的账单记录'}</p><p className="mt-1 text-xs text-muted-foreground">完成一次批量核算后会自动出现在这里</p></div>}
    </section>
  </>;
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

function OrderedMultiColumnSelect({ label, values, setValues, options, required, dialogTitle = '按顺序选择结算列', dialogDescription = '点选顺序就是组合顺序，也可用箭头调整。', hint = '示例：先选 A，再选 B，组合值为 A值+B值；A+B 与 A+C 是两种不同关系。', joinText = ' + ' }: { label: string; values: string[]; setValues: (values: string[]) => void; options: { value: string; label: string }[]; required?: boolean; dialogTitle?: string; dialogDescription?: string; hint?: string; joinText?: string }) {
  const selectedOptions = values.map((value) => options.find((option) => option.value === value)).filter((option): option is { value: string; label: string } => Boolean(option));
  const toggle = (value: string) => setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const move = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    setValues(next);
  };
  return <div className="space-y-2 lg:col-span-2"><span className="text-xs font-semibold text-slate-600">{label}{required && <span className="ml-1 text-rose-500">*</span>}</span><Popover><PopoverTrigger className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-white px-3 py-2 text-left text-sm outline-none transition hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><span className={selectedOptions.length ? 'min-w-0 truncate text-slate-800' : 'text-muted-foreground'}>{selectedOptions.length ? selectedOptions.map((option, index) => `${index + 1}. ${option.label.split('（例：')[0]}`).join(joinText) : '请选择一列或多列'}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></PopoverTrigger><PopoverContent align="start" className="w-[min(92vw,480px)] gap-0 p-0"><div className="border-b px-3 py-2.5"><p className="text-sm font-semibold">{dialogTitle}</p><p className="mt-1 text-xs text-muted-foreground">{dialogDescription}</p></div>{selectedOptions.length > 0 && <div className="border-b bg-teal-50/60 p-2"><p className="px-1 pb-1 text-[11px] font-semibold text-teal-800">当前顺序</p>{selectedOptions.map((option, index) => <div key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-700 text-[11px] font-semibold text-white">{index + 1}</span><span className="min-w-0 flex-1 truncate">{option.label}</span><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`上移${option.label}`} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-25"><ArrowUp className="size-3.5" /></button><button type="button" onClick={() => move(index, 1)} disabled={index === selectedOptions.length - 1} aria-label={`下移${option.label}`} className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-25"><ArrowDown className="size-3.5" /></button></div>)}</div>}<div className="max-h-64 overflow-y-auto p-1.5">{options.map((option) => { const selectedIndex = values.indexOf(option.value); return <button type="button" key={option.value} onClick={() => toggle(option.value)} className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${selectedIndex >= 0 ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}><span className={`grid size-5 shrink-0 place-items-center rounded border ${selectedIndex >= 0 ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-transparent'}`}>{selectedIndex >= 0 ? <span className="text-[11px] font-semibold">{selectedIndex + 1}</span> : <Check className="size-3" />}</span><span className="min-w-0 flex-1 truncate">{option.label}</span></button>; })}</div></PopoverContent></Popover><p className="text-[11px] leading-4 text-muted-foreground">{hint}</p></div>;
}

function PriceRow({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-slate-400">{label}</span><span className={accent ? 'font-semibold text-white' : 'font-medium text-slate-200'}>{value < 0 ? '-' : ''}¥{Math.abs(value).toFixed(2)}</span></div>;
}

function Metric({ label, value, unit, trend, warning }: { label: string; value: string; unit: string; trend: string; warning?: boolean }) {
  return <div className="min-w-0 rounded-2xl border bg-white p-5"><p className="text-xs font-medium text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="shrink-0"><span className="text-2xl font-semibold">{value}</span><span className="ml-1 text-xs text-muted-foreground">{unit}</span></p><span className={`truncate rounded-full px-2 py-1 text-[11px] font-medium ${warning ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{trend}</span></div></div>;
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-white px-3 py-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}

function QuoteTagGroup({ label, values, accent }: { label: string; values: string[]; accent?: boolean }) {
  return <div><p className="text-xs font-semibold text-slate-600">{label}</p><div className="mt-2 flex flex-wrap gap-2">{values.length ? values.slice(0, 12).map((value) => <span key={value} className={`rounded-full px-2.5 py-1 text-xs ${accent ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{value}</span>) : <span className="text-xs text-muted-foreground">未设置</span>}</div></div>;
}

function formatSurchargeDetails(row: FeeResult) {
  const details = Object.entries(row.surchargeDetails ?? {});
  return details.length ? details.map(([name, fee]) => `${name} ¥${fee.toFixed(2)}`).join('；') : '无';
}

function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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

function emptyBatchMapping(): BatchColumnMapping {
  return { destinationColumns: [], weight: '', quotePlan: '', rateCondition: '', trackingNo: '', store: '', date: '', settlementColumns: [] };
}

function inferBatchMapping(grid: unknown[][], headerRow: number): BatchColumnMapping {
  const headers = (grid[headerRow] ?? []).map((cell) => cellText(cell).toLowerCase());
  const find = (patterns: RegExp[]) => {
    const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return index < 0 ? '' : String(index);
  };
  const destination = find([/完整.*地址/, /目的地/, /收货.*地/, /收件.*地/, /destination/]);
  const province = find([/^省$/, /省份/, /收件.*省/, /收货.*省/]);
  const city = find([/^市$/, /城市/, /收件.*市/, /收货.*市/]);
  const district = find([/^区$/, /区县/, /县区/, /收件.*区/, /收货.*区/]);
  const destinationColumns = destination ? [destination] : [province, city, district].filter(Boolean);
  const mapping = {
    destinationColumns,
    weight: find([/结算重量/, /计费重量/, /实际重量/, /重量/, /weight/]),
    quotePlan: find([/报价方案/, /报价名称/, /计费方案/, /快递产品/, /承运方案/]),
    rateCondition: find([/物流公司/, /物流渠道/, /承运公司/, /快递公司/, /报价条件/, /计费条件/]),
    trackingNo: find([/运单号/, /快递单号/, /物流单号/, /tracking/]),
    store: find([/店铺/, /客户/, /结算对象/, /store/]),
    date: find([/发货日期/, /揽收时间/, /账单日期/, /日期/, /date/]),
    settlementColumns: [] as string[],
  };
  const combinedColumn = find([/结算条件组合值/, /组合匹配值/, /结算组合值/]);
  mapping.settlementColumns = combinedColumn ? [combinedColumn] : [];
  return mapping;
}

function parseWeightCell(value: unknown) {
  if (typeof value === 'number') return value;
  const normalized = cellText(value).replaceAll(',', '').replace(/千克|公斤|kg/gi, '').trim();
  const matched = normalized.match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : Number.NaN;
}

function gridToMappedShipments(grid: unknown[][], headerRow: number, mapping: BatchColumnMapping): ShipmentInput[] {
  const indexOf = (value: string) => value === '' ? -1 : Number(value);
  const destinationColumns = mapping.destinationColumns.map(Number);
  const weight = indexOf(mapping.weight);
  const quotePlan = indexOf(mapping.quotePlan);
  const rateCondition = indexOf(mapping.rateCondition);
  const trackingNo = indexOf(mapping.trackingNo);
  const store = indexOf(mapping.store);
  const date = indexOf(mapping.date);
  const settlementColumns = mapping.settlementColumns.map(Number);
  return grid.slice(headerRow + 1).map((row, index) => ({ row, sourceRow: headerRow + index + 2 })).filter(({ row }) => rowHasValue(row) && [...destinationColumns, weight, quotePlan, ...settlementColumns].some((column) => column >= 0 && cellText(row[column]) !== '')).map(({ row, sourceRow }) => {
    const settlementKey = combineSettlementValues(settlementColumns.map((column) => cellText(row[column])));
    return {
      trackingNo: trackingNo >= 0 ? cellText(row[trackingNo]) || `ROW-${sourceRow}` : `ROW-${sourceRow}`,
      destination: combineDestinationValues(destinationColumns.map((column) => cellText(row[column]))),
      weight: parseWeightCell(row[weight]),
      quotePlan: quotePlan >= 0 ? cellText(row[quotePlan]) : '',
      rateCondition: rateCondition >= 0 ? cellText(row[rateCondition]) : '',
      store: store >= 0 ? cellText(row[store]) : '',
      settlementKey,
      date: date >= 0 ? formatCellDate(row[date]) : '',
      sourceRow,
    };
  });
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

function normalizeHeader(value: unknown) {
  return cellText(value).toLowerCase().replace(/[（）\s]/g, (char) => char === '（' ? '(' : char === '）' ? ')' : '');
}

function parseBindingTemplate(grid: unknown[][], quoteNames: string[]): Binding[] {
  if (grid.length < 2) throw new Error('模板中没有可导入的结算关系');
  const headers = grid[0].map(cellText);
  const normalizedHeaders = headers.map(normalizeHeader);
  const quoteIndex = normalizedHeaders.findIndex((header) => /^(所用报价|报价名称|报价方案)$/.test(header));
  const prepaidIndex = normalizedHeaders.findIndex((header) => /^预付面单费(?:\(元\))?$/.test(header));
  if (quoteIndex < 0 || prepaidIndex < 0) throw new Error('模板必须包含“所用报价/报价名称”和“预付面单费”两列');
  const matchKeyIndex = normalizedHeaders.findIndex((header) => /^(结算条件组合值|组合匹配值|结算组合值)$/.test(header));
  const legacyConditionIndexes = headers.map((header, index) => ({ header, index })).filter((item) => item.header && item.index !== quoteIndex && item.index !== prepaidIndex);
  if (matchKeyIndex < 0 && !legacyConditionIndexes.length) throw new Error('模板必须包含“结算条件组合值”列');
  const rows = grid.slice(1).filter((row) => row.some((cell) => cellText(cell)));
  if (!rows.length) throw new Error('模板中没有可导入的结算关系');
  const combinations = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    const legacyValues = legacyConditionIndexes.map(({ index: column }) => cellText(row[column]));
    if (matchKeyIndex < 0 && legacyValues.some((value) => !value)) throw new Error(`第 ${rowNumber} 行结算条件不能为空`);
    const matchKey = cleanSettlementKey(matchKeyIndex >= 0 ? cellText(row[matchKeyIndex]) : combineSettlementValues(legacyValues));
    if (!matchKey) throw new Error(`第 ${rowNumber} 行“结算条件组合值”不能为空`);
    const requestedQuote = cellText(row[quoteIndex]);
    const matchedQuote = quoteNames.find((name) => quoteNamesMatch(requestedQuote, name));
    if (!requestedQuote || !matchedQuote) throw new Error(`第 ${rowNumber} 行报价“${requestedQuote || '空白'}”未在报价管理中导入`);
    const combinationKey = normalizeMatchValue(matchKey);
    if (combinations.has(combinationKey)) throw new Error(`第 ${rowNumber} 行匹配条件组合重复`);
    combinations.add(combinationKey);
    const prepaid = Number(row[prepaidIndex]);
    if (!Number.isFinite(prepaid) || prepaid < 0) throw new Error(`第 ${rowNumber} 行预付面单费必须是大于或等于 0 的数字`);
    return { id: crypto.randomUUID(), customer: '', store: '', quote: matchedQuote, prepaid, matchKey };
  });
}

function migrateBinding(binding: Binding): Binding {
  return { ...binding, matchKey: getBindingKey(binding) };
}

function getBindingConditions(binding: Binding): Record<string, string> {
  if (binding.conditions && Object.keys(binding.conditions).length) return binding.conditions;
  const conditions: Record<string, string> = {};
  if (binding.customer) conditions['所属客户'] = binding.customer;
  if (binding.store) conditions['店铺名称'] = binding.store;
  return conditions;
}

function normalizeMatchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function combineSettlementValues(values: string[]) {
  return values.map((value) => value.trim()).join('+');
}

function combineDestinationValues(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).join(' / ');
}

function cleanSettlementKey(value: string) {
  return value.split('+').map((part) => part.trim()).join('+');
}

function getBindingKey(binding: Binding) {
  if (binding.matchKey?.trim()) return cleanSettlementKey(binding.matchKey);
  return combineSettlementValues(Object.values(getBindingConditions(binding)));
}

function settlementKeysEqual(left: string, right: string) {
  return normalizeMatchValue(left) === normalizeMatchValue(right);
}

function resolveBinding(bindings: Binding[], settlementKey: string) {
  if (!bindings.length) return { binding: undefined, error: '' };
  const cleanedKey = cleanSettlementKey(settlementKey);
  if (!cleanedKey || cleanedKey.split('+').some((part) => !part)) return { binding: undefined, error: `结算条件组合值包含空白项；收到：${cleanedKey || '未提供'}` };
  const matches = bindings.filter((binding) => settlementKeysEqual(getBindingKey(binding), cleanedKey));
  if (!matches.length) return { binding: undefined, error: `没有命中任何结算关系；收到组合值：${cleanedKey}` };
  if (matches.length > 1) return { binding: undefined, error: `组合值“${cleanedKey}”同时命中 ${matches.length} 条关系，请删除重复规则` };
  return { binding: matches[0], error: '' };
}

function legacySettlementKey(row: ShipmentInput) {
  if (row.matchFields && Object.keys(row.matchFields).length) return combineSettlementValues(Object.values(row.matchFields));
  return combineSettlementValues([row.customer ?? '', row.store ?? ''].filter(Boolean));
}

function formatBindingConditions(binding: Binding) {
  return getBindingKey(binding);
}

function findWorkbookQuote(quotes: ImportedWorkbookQuote[], requested: string) {
  return quotes.find((quote) => quoteNamesMatch(requested, quote.quoteName));
}

function feeError(input: ShipmentInput, quoteName: string, explanation: string, prepaid = 0): FeeResult {
  return { ...input, roundedWeight: 0, baseFee: 0, surcharge: 0, prepaid, total: 0, quoteName, status: 'error', explanation };
}

function formatCellDate(value: unknown) { return cellText(value); }

function downloadCsv(name: string, rows: unknown[][]) {
  const escaped = rows.map((row) => row.map((cell) => `"${cellText(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${escaped}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportResultsCsv(name: string, results: FeeResult[]) {
  const surchargeNames = [...new Set(results.flatMap((row) => Object.keys(row.surchargeDetails ?? {})))];
  const headers = ['原表行号', '运单号', '目的地', '重量kg', '计费重量kg', '结算条件组合值', '物流公司/报价条件', '日期', '账单报价方案', '实际使用报价', '基础费用', ...surchargeNames, '附加费合计', '面单抵扣', '合计运费', '状态', '计算说明'];
  const data = results.map((row) => [row.sourceRow ?? '', row.trackingNo, row.destination, row.weight, row.roundedWeight, row.settlementKey ?? '', row.rateCondition ?? '', row.date ?? '', row.quotePlan ?? '', row.quoteName, row.baseFee, ...surchargeNames.map((surchargeName) => row.surchargeDetails?.[surchargeName] ?? 0), row.surcharge, row.prepaid, row.total, row.status === 'ok' ? '成功' : '异常', row.explanation]);
  downloadCsv(name, [headers, ...data]);
}

function exportOriginalWithResultsCsv(name: string, originalGrid: unknown[][], headerRow: number, results: FeeResult[]) {
  const surchargeNames = [...new Set(results.flatMap((row) => Object.keys(row.surchargeDetails ?? {})))];
  const appendedHeaders = ['核算_实际使用报价', '核算_计费重量kg', '核算_基础费用', ...surchargeNames.map((item) => `核算_${item}`), '核算_附加费合计', '核算_面单抵扣', '核算_合计运费', '核算_状态', '核算_计算说明'];
  const resultBySourceRow = new Map(results.map((row) => [row.sourceRow, row]));
  const blankAppend = appendedHeaders.map(() => '');
  const rows = originalGrid.map((row, index) => {
    if (index === headerRow) return [...row, ...appendedHeaders];
    const result = resultBySourceRow.get(index + 1);
    if (!result) return [...row, ...blankAppend];
    return [...row, result.quoteName, result.roundedWeight, result.baseFee, ...surchargeNames.map((surchargeName) => result.surchargeDetails?.[surchargeName] ?? 0), result.surcharge, result.prepaid, result.total, result.status === 'ok' ? '成功' : '异常', result.explanation];
  });
  downloadCsv(name, rows);
}
