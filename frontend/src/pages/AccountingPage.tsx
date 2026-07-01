import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  FileUp,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  Users,
  Wallet,
  BarChart3,
} from 'lucide-react'
import {
  api,
  type AcctAccount,
  type AcctBill,
  type AcctContact,
  type AcctDashboard,
  type AcctDocumentLine,
  type AcctEstimate,
  type AcctPayment,
  type AcctPurchaseOrder,
  type AcctSalesInvoice,
  type AcctSalesReceipt,
  type AcctSummaryReports,
  type ZohoImportModule,
  type ZohoImportPreview,
  type ZohoImportResult,
} from '../api/client'
import { ErrorState, LoadingState } from '../components/States'

type Tab = 'overview' | 'sales' | 'purchases' | 'reports' | 'contacts' | 'accounts' | 'migrate'
type SalesView = 'estimates' | 'invoices' | 'sales_receipts' | 'payment_receipts'
type PurchaseView = 'purchase_orders' | 'bills' | 'payments'
type CreateKind =
  | 'estimate'
  | 'invoice'
  | 'sales_receipt'
  | 'payment_receipt'
  | 'purchase_order'
  | 'bill'
  | 'payment_made'
  | 'contact'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'sales', label: 'Sales', icon: ArrowUpRight },
  { id: 'purchases', label: 'Purchases', icon: ArrowDownLeft },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'accounts', label: 'Chart of accounts', icon: BookOpen },
  { id: 'migrate', label: 'Migrate from Zoho', icon: Upload },
]

const CREATE_LABELS: Record<CreateKind, string> = {
  estimate: 'Estimate',
  invoice: 'Invoice',
  sales_receipt: 'Sales receipt',
  payment_receipt: 'Payment receipt',
  purchase_order: 'Purchase order',
  bill: 'Bill',
  payment_made: 'Payment made',
  contact: 'Contact',
}

function formatInr(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

function parseTab(value: string | null): Tab {
  if (value && TABS.some((t) => t.id === value)) return value as Tab
  return 'overview'
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyLine(): AcctDocumentLine {
  return { description: '', quantity: 1, rate: 0, tax_percent: 0 }
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'paid'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'overdue'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>{status}</span>
}

export function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))
  const [salesView, setSalesView] = useState<SalesView>('invoices')
  const [purchaseView, setPurchaseView] = useState<PurchaseView>('bills')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<AcctDashboard | null>(null)
  const [reports, setReports] = useState<AcctSummaryReports | null>(null)
  const [invoices, setInvoices] = useState<AcctSalesInvoice[]>([])
  const [bills, setBills] = useState<AcctBill[]>([])
  const [estimates, setEstimates] = useState<AcctEstimate[]>([])
  const [salesReceipts, setSalesReceipts] = useState<AcctSalesReceipt[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<AcctPurchaseOrder[]>([])
  const [contacts, setContacts] = useState<AcctContact[]>([])
  const [accounts, setAccounts] = useState<AcctAccount[]>([])
  const [payments, setPayments] = useState<AcctPayment[]>([])
  const [zohoModules, setZohoModules] = useState<ZohoImportModule[]>([])
  const [zohoModule, setZohoModule] = useState('chart_of_accounts')
  const [zohoPreview, setZohoPreview] = useState<ZohoImportPreview | null>(null)
  const [zohoResult, setZohoResult] = useState<ZohoImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [createKind, setCreateKind] = useState<CreateKind | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tabsLoaded = useRef(new Set<Tab>())

  const refreshDashboard = useCallback(async () => {
    const dash = await api.getAcctDashboard()
    setDashboard(dash)
  }, [])

  const loadTab = useCallback(async (t: Tab, force = false) => {
    if (!force && tabsLoaded.current.has(t)) return
    setLoading(true)
    setError(null)
    try {
      switch (t) {
        case 'overview': {
          await refreshDashboard()
          break
        }
        case 'sales': {
          const [inv, estList, srList, payList] = await Promise.all([
            api.listAcctInvoices(),
            api.listAcctEstimates(),
            api.listAcctSalesReceipts(),
            api.listAcctPayments(),
          ])
          setInvoices(inv)
          setEstimates(estList)
          setSalesReceipts(srList)
          setPayments(payList)
          break
        }
        case 'purchases': {
          const [billList, poList, payList] = await Promise.all([
            api.listAcctBills(),
            api.listAcctPurchaseOrders(),
            api.listAcctPayments(),
          ])
          setBills(billList)
          setPurchaseOrders(poList)
          setPayments(payList)
          break
        }
        case 'reports': {
          const rpt = await api.getAcctSummaryReports()
          setReports(rpt)
          break
        }
        case 'contacts': {
          const contactList = await api.listAcctContacts()
          setContacts(contactList)
          break
        }
        case 'accounts': {
          const acctList = await api.listAcctAccounts()
          setAccounts(acctList)
          break
        }
        case 'migrate': {
          const mods = await api.listZohoModules()
          setZohoModules(mods)
          break
        }
      }
      tabsLoaded.current.add(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounting')
    } finally {
      setLoading(false)
    }
  }, [refreshDashboard])

  const reloadCurrentTab = useCallback(async () => {
    tabsLoaded.current.delete(tab)
    await loadTab(tab, true)
    if (tab !== 'overview') {
      try {
        await refreshDashboard()
      } catch {
        /* overview is best-effort after mutations */
      }
    }
  }, [loadTab, refreshDashboard, tab])

  useEffect(() => {
    void loadTab(tab)
  }, [tab, loadTab])

  useEffect(() => {
    if (!createKind) return
    void (async () => {
      try {
        const tasks: Promise<void>[] = []
        if (contacts.length === 0) {
          tasks.push(api.listAcctContacts().then((rows) => setContacts(rows)).then(() => {}))
        }
        if (accounts.length === 0 && (createKind === 'payment_receipt' || createKind === 'payment_made')) {
          tasks.push(api.listAcctAccounts().then((rows) => setAccounts(rows)).then(() => {}))
        }
        await Promise.all(tasks)
      } catch {
        /* create form can still open; user may retry refresh */
      }
    })()
  }, [accounts.length, contacts.length, createKind])

  function setTab(next: Tab) {
    setSearchParams({ tab: next })
  }

  async function handleZohoPreview(file: File) {
    setImporting(true)
    setZohoResult(null)
    try {
      const preview = await api.previewZohoImport(zohoModule, file)
      setZohoPreview(preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleZohoImport(file: File) {
    setImporting(true)
    try {
      const result = await api.importZohoData(zohoModule, file)
      setZohoResult(result)
      setZohoPreview(null)
      tabsLoaded.current.clear()
      await loadTab(tab, true)
      if (tab !== 'overview') {
        try {
          await refreshDashboard()
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleCreate(payload: Record<string, unknown>) {
    if (!createKind) return
    setSaving(true)
    setError(null)
    try {
      switch (createKind) {
        case 'estimate':
          await api.createAcctEstimate(payload)
          break
        case 'invoice':
          await api.createAcctInvoice(payload)
          break
        case 'sales_receipt':
          await api.createAcctSalesReceipt(payload)
          break
        case 'payment_receipt':
          await api.createAcctPayment({ ...payload, payment_type: 'received' })
          break
        case 'purchase_order':
          await api.createAcctPurchaseOrder(payload)
          break
        case 'bill':
          await api.createAcctBill(payload)
          break
        case 'payment_made':
          await api.createAcctPayment({ ...payload, payment_type: 'made' })
          break
        case 'contact':
          await api.createAcctContact(payload as Parameters<typeof api.createAcctContact>[0])
          break
      }
      setCreateKind(null)
      await reloadCurrentTab()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const receivedPayments = payments.filter((p) => p.payment_type === 'received')
  const madePayments = payments.filter((p) => p.payment_type === 'made')

  if (loading && !dashboard) return <LoadingState message="Loading accounting…" />
  if (error && !dashboard) return <ErrorState message={error} />

  return (
    <div className="et-page et-page-wide py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">Finance</p>
          <h1 className="font-display text-2xl font-bold text-slate-900">Accounting</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Create estimates, invoices, receipts, and purchase orders. Track ageing receivables, payables, and live
            revenue.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void reloadCurrentTab()} className="et-btn-secondary inline-flex items-center gap-1 text-sm">
            <RefreshCw size={14} />
            Refresh
          </button>
          <Link to="/operations?tab=finance" className="et-btn-secondary inline-flex items-center gap-1 text-sm">
            <Landmark size={14} />
            Project finance
          </Link>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? 'border-[var(--et-navy)] text-[var(--et-navy)]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && dashboard && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Receivables', value: dashboard.total_receivables, hint: `${dashboard.invoice_count} invoices` },
              { label: 'Payables', value: dashboard.total_payables, hint: `${dashboard.bill_count} bills` },
              { label: 'Income (MTD)', value: dashboard.income_mtd, hint: 'Invoiced this month' },
              { label: 'Expenses (MTD)', value: dashboard.expense_mtd, hint: 'Bills this month' },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{formatInr(card.value)}</p>
                <p className="mt-1 text-[10px] text-slate-400">{card.hint}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="et-btn-primary text-sm" onClick={() => { setTab('sales'); setCreateKind('invoice') }}>
              <Plus size={14} /> New invoice
            </button>
            <button type="button" className="et-btn-secondary text-sm" onClick={() => { setTab('sales'); setCreateKind('estimate') }}>
              <Plus size={14} /> New estimate
            </button>
            <button type="button" className="et-btn-secondary text-sm" onClick={() => setTab('reports')}>
              View ageing & revenue
            </button>
          </div>
          {receivedPayments.length > 0 && (
            <DataTable
              title="Recent payment receipts"
              empty=""
              columns={['Contact', 'Date', 'Amount', 'Mode', 'Ref']}
              rows={receivedPayments.slice(0, 8).map((p) => [
                p.contact_name ?? '—',
                p.payment_date ?? '—',
                formatInr(p.amount),
                p.payment_mode ?? '—',
                p.reference_number ?? '—',
              ])}
            />
          )}
        </div>
      )}

      {tab === 'sales' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SubTabs
              options={[
                { id: 'estimates', label: `Estimates (${estimates.length})` },
                { id: 'invoices', label: `Invoices (${invoices.length})` },
                { id: 'sales_receipts', label: `Sales receipts (${salesReceipts.length})` },
                { id: 'payment_receipts', label: `Payment receipts (${receivedPayments.length})` },
              ]}
              value={salesView}
              onChange={(v) => setSalesView(v as SalesView)}
            />
            <div className="flex flex-wrap gap-2">
              {salesView === 'estimates' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('estimate')}>
                  <Plus size={14} /> Create estimate
                </button>
              )}
              {salesView === 'invoices' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('invoice')}>
                  <Plus size={14} /> Create invoice
                </button>
              )}
              {salesView === 'sales_receipts' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('sales_receipt')}>
                  <Plus size={14} /> Create sales receipt
                </button>
              )}
              {salesView === 'payment_receipts' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('payment_receipt')}>
                  <Plus size={14} /> Record payment receipt
                </button>
              )}
            </div>
          </div>

          {salesView === 'estimates' && (
            <DataTable
              title="Estimates / quotes"
              empty="No estimates yet — create one to send to clients."
              columns={['Number', 'Customer', 'Date', 'Expiry', 'Total', 'Status']}
              rows={estimates.map((e) => [
                e.estimate_number,
                e.contact_name ?? '—',
                e.estimate_date ?? '—',
                e.expiry_date ?? '—',
                formatInr(e.total),
                <StatusPill key={e.estimate_id} status={e.status} />,
              ])}
            />
          )}
          {salesView === 'invoices' && (
            <DataTable
              title="Sales invoices"
              empty="No invoices yet — create one or import from Zoho."
              columns={['Number', 'Customer', 'Date', 'Due', 'Total', 'Balance', 'Status']}
              rows={invoices.map((inv) => [
                inv.invoice_number,
                inv.contact_name ?? '—',
                inv.invoice_date ?? '—',
                inv.due_date ?? '—',
                formatInr(inv.total),
                formatInr(inv.balance),
                <StatusPill key={inv.sales_invoice_id} status={inv.status} />,
              ])}
            />
          )}
          {salesView === 'sales_receipts' && (
            <DataTable
              title="Sales receipts"
              empty="No sales receipts — record cash/card sales here."
              columns={['Number', 'Customer', 'Date', 'Mode', 'Total', 'Status']}
              rows={salesReceipts.map((r) => [
                r.receipt_number,
                r.contact_name ?? '—',
                r.receipt_date ?? '—',
                r.payment_mode ?? '—',
                formatInr(r.total),
                <StatusPill key={r.sales_receipt_id} status={r.status} />,
              ])}
            />
          )}
          {salesView === 'payment_receipts' && (
            <DataTable
              title="Payment receipts"
              empty="No payments recorded — apply against open invoices."
              columns={['Contact', 'Date', 'Amount', 'Mode', 'Invoice', 'Ref']}
              rows={receivedPayments.map((p) => [
                p.contact_name ?? '—',
                p.payment_date ?? '—',
                formatInr(p.amount),
                p.payment_mode ?? '—',
                p.sales_invoice_id ? invoices.find((i) => i.sales_invoice_id === p.sales_invoice_id)?.invoice_number ?? '—' : '—',
                p.reference_number ?? '—',
              ])}
            />
          )}
        </div>
      )}

      {tab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SubTabs
              options={[
                { id: 'purchase_orders', label: `Purchase orders (${purchaseOrders.length})` },
                { id: 'bills', label: `Bills (${bills.length})` },
                { id: 'payments', label: `Payments made (${madePayments.length})` },
              ]}
              value={purchaseView}
              onChange={(v) => setPurchaseView(v as PurchaseView)}
            />
            <div className="flex flex-wrap gap-2">
              {purchaseView === 'purchase_orders' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('purchase_order')}>
                  <Plus size={14} /> Create purchase order
                </button>
              )}
              {purchaseView === 'bills' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('bill')}>
                  <Plus size={14} /> Create bill
                </button>
              )}
              {purchaseView === 'payments' && (
                <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('payment_made')}>
                  <Plus size={14} /> Record payment
                </button>
              )}
            </div>
          </div>

          {purchaseView === 'purchase_orders' && (
            <DataTable
              title="Purchase orders"
              empty="No purchase orders — raise POs before vendor bills."
              columns={['Number', 'Vendor', 'Date', 'Expected', 'Total', 'Status']}
              rows={purchaseOrders.map((po) => [
                po.po_number,
                po.contact_name ?? '—',
                po.po_date ?? '—',
                po.expected_date ?? '—',
                formatInr(po.total),
                <StatusPill key={po.purchase_order_id} status={po.status} />,
              ])}
            />
          )}
          {purchaseView === 'bills' && (
            <DataTable
              title="Bills & expenses"
              empty="No bills yet — create or import vendor bills."
              columns={['Number', 'Vendor', 'Date', 'Due', 'Total', 'Balance', 'Status']}
              rows={bills.map((bill) => [
                bill.bill_number,
                bill.contact_name ?? '—',
                bill.bill_date ?? '—',
                bill.due_date ?? '—',
                formatInr(bill.total),
                formatInr(bill.balance),
                <StatusPill key={bill.bill_id} status={bill.status} />,
              ])}
            />
          )}
          {purchaseView === 'payments' && (
            <DataTable
              title="Payments made"
              empty="No vendor payments recorded."
              columns={['Vendor', 'Date', 'Amount', 'Mode', 'Bill', 'Ref']}
              rows={madePayments.map((p) => [
                p.contact_name ?? '—',
                p.payment_date ?? '—',
                formatInr(p.amount),
                p.payment_mode ?? '—',
                p.bill_id ? bills.find((b) => b.bill_id === p.bill_id)?.bill_number ?? '—' : '—',
                p.reference_number ?? '—',
              ])}
            />
          )}
        </div>
      )}

      {tab === 'reports' && reports && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Live revenue status</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Invoiced (MTD)', value: reports.revenue.invoiced_mtd },
                { label: 'Collected (MTD)', value: reports.revenue.collected_mtd },
                { label: 'Invoiced (YTD)', value: reports.revenue.invoiced_ytd },
                { label: 'Net cash (MTD)', value: reports.revenue.net_cash_mtd },
                { label: 'Sales receipts (MTD)', value: reports.revenue.sales_receipts_mtd },
                { label: 'Expenses (MTD)', value: reports.revenue.expense_mtd },
                { label: 'Outstanding AR', value: reports.revenue.outstanding_receivables },
                { label: 'Outstanding AP', value: reports.revenue.outstanding_payables },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">{card.label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatInr(card.value)}</p>
                </div>
              ))}
            </div>
          </section>

          <AgingPanel title="Receivables ageing" report={reports.receivables_aging} />
          <AgingPanel title="Payables ageing" report={reports.payables_aging} />

          {reports.revenue.by_customer.length > 0 && (
            <DataTable
              title="Revenue by customer"
              empty=""
              columns={['Customer', 'Invoiced MTD', 'Collected MTD', 'Invoiced YTD', 'Outstanding']}
              rows={reports.revenue.by_customer.map((c) => [
                c.contact_name,
                formatInr(c.invoiced_mtd),
                formatInr(c.collected_mtd),
                formatInr(c.invoiced_ytd),
                formatInr(c.outstanding),
              ])}
            />
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button type="button" className="et-btn-primary text-sm" onClick={() => setCreateKind('contact')}>
              <Plus size={14} /> Add contact
            </button>
          </div>
          <DataTable
            title="Customers & vendors"
            empty="No contacts — add customers and vendors."
            columns={['Name', 'Type', 'Email', 'Phone']}
            rows={contacts.map((c) => [c.display_name, c.contact_type, c.email ?? '—', c.phone ?? '—'])}
          />
        </div>
      )}

      {tab === 'accounts' && (
        <DataTable
          title="Chart of accounts"
          empty="Default accounts are seeded on first load."
          columns={['Code', 'Name', 'Type']}
          rows={accounts.map((a) => [a.code, a.name, a.account_type])}
        />
      )}

      {tab === 'migrate' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Zoho Books migration</h2>
            <p className="mt-1 text-xs text-slate-500">
              Export each module from Zoho as CSV or XLS, then upload here.
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Module to import
              <select
                value={zohoModule}
                onChange={(e) => {
                  setZohoModule(e.target.value)
                  setZohoPreview(null)
                  setZohoResult(null)
                }}
                className="et-select mt-1 w-full text-sm"
              >
                {zohoModules.map((m) => (
                  <option key={m.module} value={m.module}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.xls,.xlsx"
              className="mt-4 block w-full text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleZohoPreview(file)
              }}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importing || !fileRef.current?.files?.[0]}
                onClick={() => {
                  const file = fileRef.current?.files?.[0]
                  if (file) void handleZohoImport(file)
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--et-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                Import into ET Scout
              </button>
            </div>
          </div>
          <div className="space-y-4">
            {zohoPreview && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Preview</h3>
                <p className="text-xs text-slate-500">
                  {zohoPreview.valid_rows} valid / {zohoPreview.error_rows} errors of {zohoPreview.total_rows} rows
                </p>
              </div>
            )}
            {zohoResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Import complete</p>
                <p className="mt-1">
                  Imported {zohoResult.imported}, skipped {zohoResult.skipped}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {createKind && (
        <CreateDocumentModal
          kind={createKind}
          contacts={contacts}
          invoices={invoices}
          bills={bills}
          saving={saving}
          onClose={() => setCreateKind(null)}
          onSave={handleCreate}
        />
      )}
    </div>
  )
}

function SubTabs({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            value === opt.id ? 'bg-white text-[var(--et-navy)] shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function AgingPanel({ title, report }: { title: string; report: AcctSummaryReports['receivables_aging'] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">Total outstanding: {formatInr(report.total_outstanding)}</p>
      </div>
      <div className="grid gap-2 p-4 sm:grid-cols-5">
        {report.buckets.map((b) => (
          <div key={b.bucket} className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-[10px] font-medium uppercase text-slate-500">{b.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatInr(b.amount)}</p>
            <p className="text-[10px] text-slate-400">{b.count} open</p>
          </div>
        ))}
      </div>
      {report.lines.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500">
                {['Document', 'Contact', 'Due', 'Days overdue', 'Balance'].map((col) => (
                  <th key={col} className="px-4 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.lines.slice(0, 20).map((line) => (
                <tr key={line.document_id} className="border-t border-slate-50">
                  <td className="px-4 py-2">{line.document_number}</td>
                  <td className="px-4 py-2">{line.contact_name ?? '—'}</td>
                  <td className="px-4 py-2">{line.due_date ?? '—'}</td>
                  <td className="px-4 py-2">{line.days_overdue}</td>
                  <td className="px-4 py-2 font-medium">{formatInr(line.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CreateDocumentModal({
  kind,
  contacts,
  invoices,
  bills,
  saving,
  onClose,
  onSave,
}: {
  kind: CreateKind
  contacts: AcctContact[]
  invoices: AcctSalesInvoice[]
  bills: AcctBill[]
  saving: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>) => Promise<void>
}) {
  const isContact = kind === 'contact'
  const isPayment = kind === 'payment_receipt' || kind === 'payment_made'
  const isLineDoc = !isContact && !isPayment

  const [number, setNumber] = useState('')
  const [contactId, setContactId] = useState('')
  const [docDate, setDocDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState('')
  const [paymentMode, setPaymentMode] = useState('Bank transfer')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [linkedInvoiceId, setLinkedInvoiceId] = useState('')
  const [linkedBillId, setLinkedBillId] = useState('')
  const [notes, setNotes] = useState('')
  const [contactType, setContactType] = useState('customer')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [lines, setLines] = useState<AcctDocumentLine[]>([emptyLine()])

  const filteredContacts = contacts.filter((c) => {
    if (kind === 'purchase_order' || kind === 'bill' || kind === 'payment_made') return c.contact_type === 'vendor'
    if (isContact) return true
    return c.contact_type === 'customer'
  })

  const openInvoices = invoices.filter((i) => i.balance > 0)
  const openBills = bills.filter((b) => b.balance > 0)

  function updateLine(idx: number, patch: Partial<AcctDocumentLine>) {
    setLines((prev) => prev.map((ln, i) => (i === idx ? { ...ln, ...patch } : ln)))
  }

  function lineTotal(ln: AcctDocumentLine): number {
    const base = Number(ln.quantity || 0) * Number(ln.rate || 0)
    const tax = base * Number(ln.tax_percent || 0) / 100
    return base + tax
  }

  const docTotal = lines.reduce((sum, ln) => sum + lineTotal(ln), 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isContact) {
      void onSave({
        contact_type: contactType,
        display_name: displayName.trim(),
        email: email.trim() || undefined,
      })
      return
    }
    if (isPayment) {
      void onSave({
        contact_id: contactId || undefined,
        amount: Number(amount),
        payment_date: docDate,
        payment_mode: paymentMode,
        reference_number: reference.trim() || undefined,
        sales_invoice_id: kind === 'payment_receipt' && linkedInvoiceId ? linkedInvoiceId : undefined,
        bill_id: kind === 'payment_made' && linkedBillId ? linkedBillId : undefined,
      })
      return
    }

    const payload: Record<string, unknown> = {
      contact_id: contactId || undefined,
      notes: notes.trim() || undefined,
      lines: lines
        .filter((ln) => ln.description.trim())
        .map((ln) => ({
          description: ln.description.trim(),
          quantity: Number(ln.quantity),
          rate: Number(ln.rate),
          tax_percent: Number(ln.tax_percent || 0),
        })),
    }

    if (kind === 'estimate') {
      payload.estimate_number = number.trim()
      payload.estimate_date = docDate
      payload.expiry_date = dueDate || undefined
    } else if (kind === 'invoice') {
      payload.invoice_number = number.trim()
      payload.invoice_date = docDate
      payload.due_date = dueDate || undefined
    } else if (kind === 'sales_receipt') {
      payload.receipt_number = number.trim()
      payload.receipt_date = docDate
      payload.payment_mode = paymentMode
    } else if (kind === 'purchase_order') {
      payload.po_number = number.trim()
      payload.po_date = docDate
      payload.expected_date = dueDate || undefined
    } else if (kind === 'bill') {
      payload.bill_number = number.trim()
      payload.bill_date = docDate
      payload.due_date = dueDate || undefined
    }
    void onSave(payload)
  }

  const numberLabel =
    kind === 'estimate'
      ? 'Estimate number'
      : kind === 'invoice'
        ? 'Invoice number'
        : kind === 'sales_receipt'
          ? 'Receipt number'
          : kind === 'purchase_order'
            ? 'PO number'
            : kind === 'bill'
              ? 'Bill number'
              : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-slate-900">Create {CREATE_LABELS[kind]}</h3>

        <div className="mt-4 space-y-3">
          {isContact ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Type</span>
                <select className="et-input w-full" value={contactType} onChange={(e) => setContactType(e.target.value)}>
                  <option value="customer">Customer</option>
                  <option value="vendor">Vendor</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Name</span>
                <input className="et-input w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Email</span>
                <input className="et-input w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              {!isPayment && (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">{numberLabel}</span>
                  <input className="et-input w-full" value={number} onChange={(e) => setNumber(e.target.value)} required />
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">{kind === 'payment_made' ? 'Vendor' : 'Customer / contact'}</span>
                <select className="et-input w-full" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— Select —</option>
                  {filteredContacts.map((c) => (
                    <option key={c.contact_id} value={c.contact_id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-600">Date</span>
                <input className="et-input w-full" type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
              </label>
              {isPayment ? (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Amount (INR)</span>
                    <input
                      className="et-input w-full"
                      type="number"
                      min={0}
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Payment mode</span>
                    <select className="et-input w-full" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                      <option>Bank transfer</option>
                      <option>UPI</option>
                      <option>Cheque</option>
                      <option>Cash</option>
                      <option>Card</option>
                    </select>
                  </label>
                  {kind === 'payment_receipt' && openInvoices.length > 0 && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">Apply to invoice (optional)</span>
                      <select className="et-input w-full" value={linkedInvoiceId} onChange={(e) => setLinkedInvoiceId(e.target.value)}>
                        <option value="">— None —</option>
                        {openInvoices.map((inv) => (
                          <option key={inv.sales_invoice_id} value={inv.sales_invoice_id}>
                            {inv.invoice_number} — balance {formatInr(inv.balance)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {kind === 'payment_made' && openBills.length > 0 && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">Apply to bill (optional)</span>
                      <select className="et-input w-full" value={linkedBillId} onChange={(e) => setLinkedBillId(e.target.value)}>
                        <option value="">— None —</option>
                        {openBills.map((bill) => (
                          <option key={bill.bill_id} value={bill.bill_id}>
                            {bill.bill_number} — balance {formatInr(bill.balance)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Reference</span>
                    <input className="et-input w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  {(kind === 'invoice' || kind === 'bill' || kind === 'estimate' || kind === 'purchase_order') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">
                        {kind === 'estimate' ? 'Expiry date' : kind === 'purchase_order' ? 'Expected date' : 'Due date'}
                      </span>
                      <input className="et-input w-full" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    </label>
                  )}
                  {kind === 'sales_receipt' && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-600">Payment mode</span>
                      <select className="et-input w-full" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                        <option>Bank transfer</option>
                        <option>UPI</option>
                        <option>Cash</option>
                        <option>Card</option>
                      </select>
                    </label>
                  )}
                  {isLineDoc && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-600">Line items</p>
                      {lines.map((ln, idx) => (
                        <div key={idx} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                          <input
                            className="et-input text-sm"
                            placeholder="Description"
                            value={ln.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                          />
                          <input
                            className="et-input text-sm"
                            type="number"
                            min={0}
                            placeholder="Qty"
                            value={ln.quantity}
                            onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                          />
                          <input
                            className="et-input text-sm"
                            type="number"
                            min={0}
                            placeholder="Rate"
                            value={ln.rate}
                            onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })}
                          />
                          <input
                            className="et-input text-sm"
                            type="number"
                            min={0}
                            placeholder="Tax %"
                            value={ln.tax_percent ?? 0}
                            onChange={(e) => updateLine(idx, { tax_percent: Number(e.target.value) })}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--et-teal-dark)]"
                        onClick={() => setLines((prev) => [...prev, emptyLine()])}
                      >
                        + Add line
                      </button>
                      <p className="text-right text-sm font-semibold text-slate-800">Total: {formatInr(docTotal)}</p>
                    </div>
                  )}
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-600">Notes</span>
                    <textarea className="et-input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </label>
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="et-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="et-btn-primary" disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Save {CREATE_LABELS[kind].toLowerCase()}
          </button>
        </div>
      </form>
    </div>
  )
}

function DataTable({
  title,
  empty,
  columns,
  rows,
}: {
  title: string
  empty: string
  columns: string[]
  rows: (string | ReactNode)[][]
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                {columns.map((col) => (
                  <th key={col} className="px-4 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-slate-800">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
