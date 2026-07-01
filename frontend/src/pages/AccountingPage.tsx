import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  FileUp,
  Landmark,
  Loader2,
  RefreshCw,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'
import {
  api,
  type AcctAccount,
  type AcctBill,
  type AcctContact,
  type AcctDashboard,
  type AcctPayment,
  type AcctSalesInvoice,
  type ZohoImportModule,
  type ZohoImportPreview,
  type ZohoImportResult,
} from '../api/client'
import { ErrorState, LoadingState } from '../components/States'

type Tab = 'overview' | 'sales' | 'purchases' | 'contacts' | 'accounts' | 'migrate'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'sales', label: 'Sales', icon: ArrowUpRight },
  { id: 'purchases', label: 'Purchases', icon: ArrowDownLeft },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'accounts', label: 'Chart of accounts', icon: BookOpen },
  { id: 'migrate', label: 'Migrate from Zoho', icon: Upload },
]

function formatInr(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}

function parseTab(value: string | null): Tab {
  if (value && TABS.some((t) => t.id === value)) return value as Tab
  return 'overview'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<AcctDashboard | null>(null)
  const [invoices, setInvoices] = useState<AcctSalesInvoice[]>([])
  const [bills, setBills] = useState<AcctBill[]>([])
  const [contacts, setContacts] = useState<AcctContact[]>([])
  const [accounts, setAccounts] = useState<AcctAccount[]>([])
  const [payments, setPayments] = useState<AcctPayment[]>([])
  const [zohoModules, setZohoModules] = useState<ZohoImportModule[]>([])
  const [zohoModule, setZohoModule] = useState('chart_of_accounts')
  const [zohoPreview, setZohoPreview] = useState<ZohoImportPreview | null>(null)
  const [zohoResult, setZohoResult] = useState<ZohoImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dash, inv, billList, contactList, acctList, payList, mods] = await Promise.all([
        api.getAcctDashboard(),
        api.listAcctInvoices(),
        api.listAcctBills(),
        api.listAcctContacts(),
        api.listAcctAccounts(),
        api.listAcctPayments(),
        api.listZohoModules(),
      ])
      setDashboard(dash)
      setInvoices(inv)
      setBills(billList)
      setContacts(contactList)
      setAccounts(acctList)
      setPayments(payList)
      setZohoModules(mods)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounting')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  if (loading && !dashboard) return <LoadingState message="Loading accounting…" />
  if (error && !dashboard) return <ErrorState message={error} />

  return (
    <div className="et-page et-page-wide py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--et-teal)]">Finance</p>
          <h1 className="font-display text-2xl font-bold text-slate-900">Accounting</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Zoho Books–compatible ledger — sales, purchases, contacts, chart of accounts, and one-click
            migration from Zoho CSV exports.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="et-btn-secondary inline-flex items-center gap-1 text-sm">
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
              { label: 'Income (MTD)', value: dashboard.income_mtd, hint: 'Sales invoices this month' },
              { label: 'Expenses (MTD)', value: dashboard.expense_mtd, hint: 'Bills this month' },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500">{card.label}</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{formatInr(card.value)}</p>
                <p className="mt-1 text-[10px] text-slate-400">{card.hint}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-[var(--et-yellow)]/30 bg-[var(--et-yellow-light)]/40 p-4 text-sm text-[var(--et-navy)]">
            <strong>Migration tip:</strong> Export from Zoho Books (CSV or XLS) in this order: Chart of Accounts →
            Contacts → Invoices → Bills → Payments. Use the <button type="button" className="font-semibold underline" onClick={() => setTab('migrate')}>Migrate from Zoho</button> tab.
          </div>
        </div>
      )}

      {tab === 'sales' && (
        <DataTable
          title="Sales invoices"
          empty="No invoices yet — import from Zoho or create via API."
          columns={['Number', 'Customer', 'Date', 'Total', 'Balance', 'Status']}
          rows={invoices.map((inv) => [
            inv.invoice_number,
            inv.contact_name ?? '—',
            inv.invoice_date ?? '—',
            formatInr(inv.total),
            formatInr(inv.balance),
            <StatusPill key={inv.sales_invoice_id} status={inv.status} />,
          ])}
        />
      )}

      {tab === 'purchases' && (
        <DataTable
          title="Bills & expenses"
          empty="No bills yet — import vendor bills from Zoho Purchases export."
          columns={['Number', 'Vendor', 'Date', 'Total', 'Balance', 'Status']}
          rows={bills.map((bill) => [
            bill.bill_number,
            bill.contact_name ?? '—',
            bill.bill_date ?? '—',
            formatInr(bill.total),
            formatInr(bill.balance),
            <StatusPill key={bill.bill_id} status={bill.status} />,
          ])}
        />
      )}

      {tab === 'contacts' && (
        <DataTable
          title="Customers & vendors"
          empty="No contacts — import from Zoho Contacts export."
          columns={['Name', 'Type', 'Email', 'Phone']}
          rows={contacts.map((c) => [
            c.display_name,
            c.contact_type,
            c.email ?? '—',
            c.phone ?? '—',
          ])}
        />
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
              Export each module from Zoho as CSV or XLS, then upload here. Column headers are auto-mapped to
              Zoho&apos;s standard export format.
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
            {zohoModules.find((m) => m.module === zohoModule) && (
              <p className="mt-2 text-[10px] text-slate-400">
                {zohoModules.find((m) => m.module === zohoModule)?.description}
              </p>
            )}
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
                <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
                  {zohoPreview.rows.slice(0, 30).map((row) => (
                    <li
                      key={row.row}
                      className={row.status === 'error' ? 'text-rose-700' : 'text-slate-700'}
                    >
                      Row {row.row}: {row.status === 'error' ? row.message : JSON.stringify(row.preview)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {zohoResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Import complete</p>
                <p className="mt-1">
                  Imported {zohoResult.imported}, skipped {zohoResult.skipped}
                  {zohoResult.errors.length > 0 && `, ${zohoResult.errors.length} errors`}
                </p>
                {zohoResult.errors.length > 0 && (
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {zohoResult.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Supported Zoho modules</p>
              <ul className="mt-2 space-y-2">
                {zohoModules.map((m) => (
                  <li key={m.module}>
                    <strong>{m.label}</strong> — expected columns: {m.sample_columns.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {payments.length > 0 && tab === 'overview' && (
        <div className="mt-6">
          <DataTable
            title="Recent payments"
            empty=""
            columns={['Type', 'Contact', 'Date', 'Amount', 'Mode']}
            rows={payments.slice(0, 10).map((p) => [
              p.payment_type,
              p.contact_name ?? '—',
              p.payment_date ?? '—',
              formatInr(p.amount),
              p.payment_mode ?? '—',
            ])}
          />
        </div>
      )}
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
