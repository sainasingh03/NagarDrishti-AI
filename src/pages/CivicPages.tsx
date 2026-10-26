import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, ArrowDownToLine, ArrowRight, Building2, Check, Clipboard, Database,
  FileText, MapPin, RefreshCw, Search, ShieldAlert, ShieldCheck, Unplug,
} from 'lucide-react'
import MapView from '../components/MapView'
import { fetchReports, type Hazard } from '../lib/api'
import { DEPARTMENT_PREVIEWS, prepareComplaintDraft, type ComplaintDraft } from '../lib/integrations'

const CATEGORY_NAMES: Record<string, string> = {
  pothole: 'Pothole', road_crack: 'Road crack', damaged_surface: 'Damaged surface',
  waterlogging: 'Waterlogging', other: 'Other hazard',
}
const CATEGORY_FILTERS = [
  { value: '', label: 'All categories' },
  { value: 'pothole', label: 'Potholes' },
  { value: 'road_crack', label: 'Road cracks' },
  { value: 'damaged_surface', label: 'Damaged surface' },
  { value: 'waterlogging', label: 'Waterlogging' },
  { value: 'other', label: 'Other' },
]

function useApplicationReports() {
  const [reports, setReports] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => {
      setLoading(true)
      setError('')
      fetchReports()
        .then(result => { if (active) setReports(result.items) })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Application reports could not be loaded.') })
        .finally(() => { if (active) setLoading(false) })
    }
    load()
    const timer = window.setInterval(load, 30000)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible) }
  }, [revision])
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  return { reports, loading, error, refresh }
}

export function GovernmentPortalPage() {
  const { reports, loading, error, refresh } = useApplicationReports()
  const categories = countBy(reports, report => report.category)
  const statuses = countBy(reports, report => report.status)
  return <main className="app-page civic-page government-portal">
    <CivicIntro eyebrow="PUBLIC SERVICE INTEGRATION · PREVIEW" title="Government portal" description="A transparent overview of road reports currently returned by the NagarDrishti application backend. No department system is connected in this build." action={<button type="button" className="button button-outline" onClick={refresh}><RefreshCw size={15} /> Refresh records</button>} />
    {error && <CivicError message={error} onRetry={refresh} />}
    <div className="civic-notice" role="note"><Unplug size={19} /><span><b>Government integrations are not configured.</b> The department cards below are clearly labelled previews. This portal does not represent an official government service or partnership.</span></div>
    <section className="civic-metrics" aria-label="Application report metrics">
      <Metric icon={<Database />} label="Records loaded from API" value={loading ? '…' : reports.length} note="Most recent records returned" />
      <Metric icon={<Activity />} label="Submitted" value={loading ? '…' : statuses.get('submitted') || 0} note="Current backend status" />
      <Metric icon={<ShieldCheck />} label="Verified" value={loading ? '…' : statuses.get('verified') || 0} note="Current backend status" />
      <Metric icon={<Check />} label="Resolved" value={loading ? '…' : statuses.get('resolved') || 0} note="Current backend status" />
    </section>
    <div className="civic-two-column">
      <section className="cream-panel civic-panel">
        <SectionHeading eyebrow="INTEGRATION DIRECTORY · DEMO PREVIEW" title="Department connections" icon={<Building2 />} />
        <div className="integration-list">{DEPARTMENT_PREVIEWS.map(item => <article className="integration-row" key={item.id}>
          <span className="integration-icon"><Building2 size={18} /></span><span className="integration-copy"><b>{item.label}</b><small>{item.scope}</small><small className="integration-status">Example recipient · not connected</small></span><span className="demo-tag">INTERNAL RECORDS</span>
        </article>)}</div>
        <p className="civic-footnote">These labels are illustrative routing categories, not real department contacts. An authorized API, data-sharing agreement, credentials and delivery confirmation would be required before a live integration.</p>
      </section>
      <aside className="civic-aside-stack">
        <section className="cream-panel civic-panel"><SectionHeading eyebrow="LIVE APPLICATION RECORDS" title="Category distribution" icon={<Activity />} />
          {error ? <p className="civic-muted">Metrics are unavailable until the backend responds.</p> : loading ? <LoadingRows /> : reports.length ? <CategoryBreakdown data={categories} total={reports.length} /> : <EmptyMessage title="No application reports yet" text="No records were returned by the reports API. The portal does not fill empty metrics with sample counts." />}
        </section>
        <section className="civic-panel dark-civic-panel"><span className="eyebrow">AUTHORIZED WORKSPACE</span><h2>Admin dataset review</h2><p>Consent review tools remain protected by the backend administrator role.</p><Link to="/admin" className="button button-gold button-small">Open admin dashboard <ArrowRight size={15} /></Link></section>
      </aside>
    </div>
    <section className="cream-panel civic-panel civic-recent"><SectionHeading eyebrow="LATEST RECORDS FROM THE API" title="Recent road reports" icon={<FileText />} action={<Link to="/community" className="text-button">Community updates <ArrowRight size={15} /></Link>} />
      {error ? <EmptyMessage title="Records unavailable" text="Retry after the API connection is restored." action={<button type="button" className="button button-outline button-small" onClick={refresh}>Retry</button>} /> : loading ? <LoadingRows /> : <ReportRows reports={reports.slice(0, 5)} emptyTitle="No reports returned" emptyText="Real API records will appear here when available." />}
    </section>
  </main>
}

export function StateMonitoringPage() {
  const { reports, loading, error, refresh } = useApplicationReports()
  const categories = countBy(reports, report => report.category)
  const statuses = countBy(reports, report => report.status)
  return <main className="app-page civic-page state-monitoring-page">
    <CivicIntro eyebrow="INFRASTRUCTURE MONITORING · PROTOTYPE" title="State-level monitoring" description="Explore the geographic distribution of saved road reports. The current backend has no state boundary, jurisdiction, or government data feed; this screen reports application database records only." action={<button type="button" className="button button-outline" onClick={refresh}><RefreshCw size={15} /> Refresh records</button>} />
    <div className="civic-notice" role="note"><ShieldAlert size={19} /><span><b>Not a state-wide official feed.</b> Coverage is limited to reports stored in this application. A missing marker does not mean a road has been inspected or is safe.</span></div>
    {error && <CivicError message={error} onRetry={refresh} />}
    <section className="civic-metrics" aria-label="Current application records">
      <Metric icon={<MapPin />} label="Mapped observations" value={loading ? '…' : reports.length} note="Actual report coordinates" />
      <Metric icon={<Activity />} label="Open submissions" value={loading ? '…' : statuses.get('submitted') || 0} note="Submitted status only" />
      <Metric icon={<ShieldCheck />} label="Verified records" value={loading ? '…' : statuses.get('verified') || 0} note="As returned by the API" />
      <Metric icon={<Check />} label="Resolved records" value={loading ? '…' : statuses.get('resolved') || 0} note="As returned by the API" />
    </section>
    <div className="state-monitor-layout">
      <section className="map-panel civic-map-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">SAVED REPORT LOCATIONS</span><h2>Application record map</h2></div><span className="data-badge"><i />{loading ? 'Loading' : `${reports.length} records`}</span></div>
        <MapView reports={reports} height="min(62vh, 600px)" />
        <p className="civic-footnote">Markers come from real stored report coordinates. Map tile coverage and application report coverage are separate.</p>
      </section>
      <aside className="civic-aside-stack">
        <section className="cream-panel civic-panel"><SectionHeading eyebrow="API RECORDS ONLY" title="Hazard categories" icon={<Activity />} />{error ? <p className="civic-muted">Category counts could not be loaded.</p> : loading ? <LoadingRows /> : reports.length ? <CategoryBreakdown data={categories} total={reports.length} /> : <EmptyMessage title="No records to aggregate" text="The API returned no reports; no sample totals are substituted." />}</section>
        <section className="cream-panel civic-panel"><SectionHeading eyebrow="INTEGRATION READINESS" title="State data connection" icon={<Unplug />} /><div className="readiness-list"><Readiness label="Application report database" state="Connected" /><Readiness label="Jurisdiction boundaries" state="Not configured" /><Readiness label="State department feed" state="Not configured" /><Readiness label="Official case status sync" state="Not configured" /></div><p className="civic-footnote">Connection labels reflect this app's current configuration, not an assessment of government systems.</p></section>
      </aside>
    </div>
    <section className="cream-panel civic-panel civic-recent"><SectionHeading eyebrow="CURRENT RECORDS" title="Report register" icon={<FileText />} />{error ? <EmptyMessage title="Register unavailable" text="The report endpoint did not return data." action={<button type="button" className="button button-outline button-small" onClick={refresh}>Retry</button>} /> : loading ? <LoadingRows /> : <ReportRows reports={reports.slice(0, 12)} emptyTitle="No mapped reports" emptyText="Reports saved to the backend will appear in this register." />}</section>
  </main>
}

export function CommunityUpdatesPage() {
  const { reports, loading, error, refresh } = useApplicationReports()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const filtered = useMemo(() => reports.filter(report => {
    const text = `${report.id} ${report.category} ${report.description} ${report.status}`.toLowerCase()
    return (!category || report.category === category) && (!query.trim() || text.includes(query.trim().toLowerCase()))
  }), [reports, query, category])
  return <main className="app-page civic-page community-page">
    <CivicIntro eyebrow="COMMUNITY UPDATES · APPLICATION FEED" title="Road report updates" description="A searchable feed of report records returned by the existing application API. Authority announcements and complaint status updates are not connected." action={<button type="button" className="button button-outline" onClick={refresh}><RefreshCw size={15} /> Refresh feed</button>} />
    <div className="civic-notice civic-notice-subtle" role="note"><Activity size={18} /><span>This is a community report feed, not a live government notice board. It refreshes periodically while open and when you request a refresh.</span></div>
    {error && <CivicError message={error} onRetry={refresh} />}
    <section className="cream-panel civic-panel community-feed-panel">
      <div className="community-feed-controls"><label className="community-search"><Search size={17} /><span className="sr-only">Search report updates</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search category, reference or description" /></label><label className="community-category"><span className="sr-only">Filter by category</span><select value={category} onChange={event => setCategory(event.target.value)}>{CATEGORY_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
      {error ? <EmptyMessage title="Feed unavailable" text="The report API could not be reached. Your filters will remain available when it returns." action={<button className="button button-outline button-small" type="button" onClick={refresh}>Retry</button>} /> : loading ? <LoadingRows /> : <><div className="feed-result-count">{filtered.length} of {reports.length} returned records</div><ReportRows reports={filtered} emptyTitle="No matching community updates" emptyText={reports.length ? 'Try changing the search or category filter.' : 'No real report records are available yet.'} />{reports.length > 0 && <p className="civic-footnote">This feed shows saved reports only. Status values are displayed as returned by the backend.</p>}</>}
    </section>
    <div className="civic-bottom-cta"><div><span className="eyebrow">CONTRIBUTE AN OBSERVATION</span><h2>See a road hazard?</h2><p>Submit a report with its location and optional photo evidence.</p></div><Link className="button button-gold" to="/report">Report a hazard <ArrowRight size={16} /></Link></div>
  </main>
}

export function StateComplaintsPage() {
  const { reports, loading, error, refresh } = useApplicationReports()
  const [reportId, setReportId] = useState('')
  const [departmentId, setDepartmentId] = useState(DEPARTMENT_PREVIEWS[0]?.id || '')
  const [draft, setDraft] = useState<ComplaintDraft | null>(null)
  const [notice, setNotice] = useState('')
  const selectedReport = reports.find(report => report.id === reportId)
  const selectedDepartment = DEPARTMENT_PREVIEWS.find(department => department.id === departmentId)
  const createDraft = (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    if (!selectedReport || !selectedDepartment) return
    setDraft(prepareComplaintDraft(selectedReport, selectedDepartment))
    setNotice('Local draft prepared. It has not been sent to an authority.')
  }
  const copyDraft = async () => {
    if (!draft) return
    try { await navigator.clipboard.writeText(draft.text); setNotice('Draft copied to clipboard. It has not been submitted.') }
    catch { setNotice('Clipboard access was unavailable. Use Download draft instead. Nothing was submitted.') }
  }
  const downloadDraft = () => {
    if (!draft) return
    const url = URL.createObjectURL(new Blob([draft.text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `nagardrishti-local-draft-${draft.reportId.slice(0, 8)}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Local draft downloaded. It has not been sent to an authority.')
  }
  return <main className="app-page civic-page complaints-page">
    <CivicIntro eyebrow="STATE-LEVEL COMPLAINTS · DRAFT WORKFLOW" title="Prepare a road complaint" description="Build a local complaint draft from a real saved report. There is no government submission endpoint configured, so this page cannot file or confirm an official complaint." action={<Link className="button button-outline" to="/community">View community feed <ArrowRight size={15} /></Link>} />
    <div className="civic-notice" role="note"><ShieldAlert size={19} /><span><b>Draft only — not submitted.</b> Selecting a demonstration recipient and preparing a document does not contact or represent any government department.</span></div>
    <section className="cream-panel civic-panel official-complaint-links"><SectionHeading eyebrow="OFFICIAL EXTERNAL SERVICES" title="File with the responsible authority" icon={<Building2 />} /><p className="civic-muted">Use these verified public portals to file a complaint directly. NagarDrishti opens the service in a new tab; it does not claim to submit on your behalf.</p><div className="official-link-grid civic-official-grid"><a className="official-link-card" href="https://kmc.up.nic.in/" target="_blank" rel="noreferrer"><span className="official-link-icon"><Building2 /></span><b>Kanpur Nagar Nigam</b><small>Municipal services and civic complaint information.</small><span className="official-link-action">Open official site <ArrowRight size={14} /></span></a><a className="official-link-card" href="https://jansunwai.up.nic.in/?language=en_US" target="_blank" rel="noreferrer"><span className="official-link-icon"><ShieldCheck /></span><b>UP Jansunwai / CM portal</b><small>Register or track an eligible Uttar Pradesh government grievance.</small><span className="official-link-action">Open grievance portal <ArrowRight size={14} /></span></a><a className="official-link-card" href="https://uppwd.gov.in/" target="_blank" rel="noreferrer"><span className="official-link-icon"><MapPin /></span><b>Uttar Pradesh PWD</b><small>Roads, bridges and public works department.</small><span className="official-link-action">Open PWD site <ArrowRight size={14} /></span></a></div></section>
    <div className="complaint-layout">
      <section className="cream-panel civic-panel complaint-form-panel">
        <SectionHeading eyebrow="USE A SAVED REPORT" title="Complaint details" icon={<FileText />} />
        {error && <CivicError message={error} onRetry={refresh} />}
        {loading ? <LoadingRows /> : !reports.length ? <EmptyMessage title="No saved reports to attach" text="Submit a road hazard report first. This workflow will not create a fake reference or location." action={<Link className="button button-forest button-small" to="/report">Report a hazard <ArrowRight size={14} /></Link>} /> : <form className="complaint-form" onSubmit={createDraft}>
          <label className="form-label">Application report reference<select className="field" required value={reportId} onChange={event => { setReportId(event.target.value); setDraft(null); setNotice('') }}><option value="">Choose a saved report</option>{reports.map(report => <option value={report.id} key={report.id}>{CATEGORY_NAMES[report.category] || report.category} · {report.id.slice(0, 8)} · {report.status.replaceAll('_', ' ')}</option>)}</select></label>
          {selectedReport && <div className="complaint-source"><MapPin size={16} /><span><b>Saved coordinates</b><small>{selectedReport.latitude.toFixed(6)}, {selectedReport.longitude.toFixed(6)}</small></span><Link to={`/reports/${selectedReport.id}`}>View report</Link></div>}
          <label className="form-label">Suggested recipient <span className="demo-inline-label">DEMO OPTIONS</span><select className="field" value={departmentId} onChange={event => { setDepartmentId(event.target.value); setDraft(null); setNotice('') }}>{DEPARTMENT_PREVIEWS.map(department => <option value={department.id} key={department.id}>{department.label} · demo only</option>)}</select><small className="field-help">Example routing categories only. No address, API, or official contact is configured.</small></label>
          <button className="button button-forest full-button" type="submit" disabled={!selectedReport || !selectedDepartment}><FileText size={16} /> Prepare local draft</button>
        </form>}
      </section>
      <aside className="civic-aside-stack">
        <section className="cream-panel civic-panel connector-card"><SectionHeading eyebrow="INTEGRATION STATUS" title="External submission" icon={<Unplug />} /><div className="connector-status"><i /> Not configured</div><p>{'No authorized department API is registered. The complaint connector interface is ready for an approved integration, but no live connector is active.'}</p><span className="demo-tag">NO SUBMISSION SERVICE</span></section>
        {draft && <section className="cream-panel civic-panel draft-preview" aria-live="polite"><SectionHeading eyebrow="LOCAL DOCUMENT PREVIEW" title="Draft prepared" icon={<Check />} /><div className="draft-warning">Not sent · not acknowledged · not an official complaint number</div><pre>{draft.text}</pre><div className="draft-actions"><button type="button" className="button button-forest button-small" onClick={() => void copyDraft()}><Clipboard size={14} /> Copy draft</button><button type="button" className="button button-outline button-small" onClick={downloadDraft}><ArrowDownToLine size={14} /> Download</button></div></section>}
        {notice && <div className="form-alert success-alert" role="status">{notice}</div>}
      </aside>
    </div>
  </main>
}

function CivicIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title-row civic-intro"><div><div className="eyebrow eyebrow-dark">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function SectionHeading({ eyebrow, title, icon, action }: { eyebrow: string; title: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="civic-section-heading"><div><span className="civic-heading-icon">{icon}</span><span><span className="eyebrow eyebrow-dark">{eyebrow}</span><h2>{title}</h2></span></div>{action}</div>
}

function Metric({ icon, label, value, note }: { icon: ReactNode; label: string; value: number | string; note: string }) {
  return <article className="civic-metric"><span className="civic-metric-icon">{icon}</span><span className="civic-metric-value">{value}</span><span className="civic-metric-label">{label}</span><small>{note}</small></article>
}

function CategoryBreakdown({ data, total }: { data: Map<string, number>; total: number }) {
  return <div className="civic-breakdown">{Array.from(data.entries()).sort((a, b) => b[1] - a[1]).map(([category, count]) => <div className="civic-breakdown-row" key={category}><span>{CATEGORY_NAMES[category] || category.replaceAll('_', ' ')}</span><span className="civic-breakdown-track"><i style={{ width: `${total ? Math.max(4, count / total * 100) : 0}%` }} /></span><b>{count}</b></div>)}</div>
}

function ReportRows({ reports, emptyTitle, emptyText }: { reports: Hazard[]; emptyTitle: string; emptyText: string }) {
  if (!reports.length) return <EmptyMessage title={emptyTitle} text={emptyText} />
  return <div className="civic-report-list">{reports.map(report => <Link className="civic-report-row" to={`/reports/${report.id}`} key={report.id}>
    <span className="civic-report-mark"><MapPin size={17} /></span><span className="civic-report-main"><b>{CATEGORY_NAMES[report.category] || report.category}</b><small>{report.description || 'No description provided'}</small><small>{report.latitude.toFixed(4)}, {report.longitude.toFixed(4)} · {formatDate(report.created_at)}</small></span><span className="civic-report-tags">{report.is_demo && <i className="demo-tag">DEMO RECORD</i>}<i className={`status-tag status-${report.status}`}>{report.status.replaceAll('_', ' ')}</i></span><ArrowRight className="civic-row-arrow" size={16} />
  </Link>)}</div>
}

function Readiness({ label, state }: { label: string; state: string }) {
  const connected = state === 'Connected'
  return <div className="readiness-row"><span>{label}</span><b className={connected ? 'readiness-connected' : 'readiness-offline'}><i />{state}</b></div>
}

function LoadingRows() {
  return <div className="civic-skeletons" aria-label="Loading records"><i /><i /><i /></div>
}

function EmptyMessage({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="civic-empty"><span className="civic-empty-icon"><FileText size={20} /></span><b>{title}</b><span>{text}</span>{action}</div>
}

function CivicError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="civic-error" role="alert"><span><b>API request failed.</b> {message}</span><button type="button" className="button button-outline button-small" onClick={onRetry}>Retry</button></div>
}

function countBy(items: Hazard[], selector: (report: Hazard) => string) {
  const values = new Map<string, number>()
  for (const item of items) values.set(selector(item), (values.get(selector(item)) || 0) + 1)
  return values
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
