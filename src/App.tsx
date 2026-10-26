import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity, ArrowRight, Bell, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Crosshair, ExternalLink, FileText, Flower2,
  Gauge, HeartHandshake, LocateFixed, LockKeyhole, LogIn, LogOut, Map as MapIcon, MapPin, Menu, Moon, Navigation,
  Plus, RefreshCw, Route as RouteIcon, Search, Settings, ShieldCheck, Sparkles, Sun, Upload, UserRound, Users, X,
} from 'lucide-react'
import MapView from './components/MapView'
const GovernmentPortalPage = lazy(() => import('./pages/CivicPages').then(module => ({ default: module.GovernmentPortalPage })))
const StateMonitoringPage = lazy(() => import('./pages/CivicPages').then(module => ({ default: module.StateMonitoringPage })))
const StateComplaintsPage = lazy(() => import('./pages/CivicPages').then(module => ({ default: module.StateComplaintsPage })))
const CommunityUpdatesPage = lazy(() => import('./pages/CivicPages').then(module => ({ default: module.CommunityUpdatesPage })))
import {
  API_BASE, apiRequest, authenticate, fetchHazards, fetchModelStatus, fetchReports, fetchRoutes,
  getDatasetReview, getMyContributions, getMyReports, getProfile, reviewContribution, searchPlaces,
  fetchReportImage, getReportStatusEvents, submitReport, updateReportStatus, googleMapsDirectionsUrl, googleMapsSearchUrl,
  type DatasetReviewItem, type Hazard, type ModelStatus, type Place, type ReportStatus, type ReportStatusEvent, type RouteHazard, type RouteOption, type UserProfile,
} from './lib/api'
import { GOVERNMENT_PORTALS } from './lib/integrations'

const CATEGORY_NAMES: Record<string, string> = {
  pothole: 'Pothole', road_crack: 'Road crack', damaged_surface: 'Damaged surface', waterlogging: 'Waterlogging', other: 'Other hazard',
}
const CATEGORY_FILTERS = [
  { value: '', label: 'All reports' },
  { value: 'pothole', label: 'Potholes' },
  { value: 'road_crack', label: 'Road cracks' },
  { value: 'waterlogging', label: 'Waterlogging' },
  { value: 'damaged_surface', label: 'Damaged surface' },
  { value: 'other', label: 'Other' },
]
const HERO_SLIDES = [
  { src: '/images/delhi-rain-traffic.jpg', alt: 'Rain-wet New Delhi street with traffic and warm reflections', credit: 'Ravi Sharma · New Delhi, after rain', source: 'https://unsplash.com/photos/a-city-street-filled-with-lots-of-traffic-at-night-Jbu3ShwVVyE' },
  { src: '/images/gurugram-after-rain.jpg', alt: 'Rainy night street in Gurugram with reflections on wet pavement', credit: 'Harshit Katiyar · Gurugram, after rain', source: 'https://unsplash.com/photos/street-scene-at-night-with-reflections-on-wet-pavement-fzIZGS9Dh4Y' },
  { src: '/images/delhi-tree-lined-traffic.jpg', alt: 'Tree-lined Delhi road with everyday city traffic', credit: 'Raghav Triapthi · Delhi street', source: 'https://unsplash.com/pt-br/fotografias/uma-rua-da-cidade-cheia-de-muito-transito-lcKQLzvod5A' },
  { src: '/images/tree-canopy-avenue.jpg', alt: 'An urban avenue shaded by a canopy of mature trees', credit: 'Patrick Shaun · Tree-lined urban avenue', source: 'https://unsplash.com/photos/a-street-lined-with-lots-of-trees-on-both-sides-of-it-2UT5kQ3lcbA' },
]

function metresBetween(a: [number, number], b: [number, number]) {
  const radius = 6_371_000
  const radians = Math.PI / 180
  const dLat = (b[0] - a[0]) * radians
  const dLon = (b[1] - a[1]) * radians
  const lat1 = a[0] * radians
  const lat2 = b[0] * radians
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function nearestRoutePointIndex(point: [number, number], route: RouteOption) {
  const coordinates = route.geometry.coordinates
  let index = 0
  let distance = Number.POSITIVE_INFINITY
  coordinates.forEach((coordinate, currentIndex) => {
    const candidate = metresBetween(point, [coordinate[1], coordinate[0]])
    if (candidate < distance) { distance = candidate; index = currentIndex }
  })
  return index
}

function playSafetyTone() {
  try {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return false
    const context = new Context()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'; oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32)
    oscillator.connect(gain); gain.connect(context.destination)
    oscillator.start(); oscillator.stop(context.currentTime + 0.34)
    oscillator.addEventListener('ended', () => { void context.close() })
    return true
  } catch { return false }
}

type AuthValue = {
  token: string | null
  user: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => void
}
const AuthContext = createContext<AuthValue | null>(null)

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => window.localStorage.getItem('nagardrishti-token'))
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) { setUser(null); setLoading(false); return }
    let active = true
    setLoading(true)
    getProfile(token)
      .then(profile => { if (active) setUser(profile) })
      .catch(() => {
        if (active) {
          window.localStorage.removeItem('nagardrishti-token')
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const establish = async (email: string, password: string, mode: 'login' | 'register') => {
    const result = await authenticate(email, password, mode)
    window.localStorage.setItem('nagardrishti-token', result.access_token)
    setUser(result.user)
    setToken(result.access_token)
  }
  const value = useMemo<AuthValue>(() => ({
    token, user, loading,
    signIn: (email, password) => establish(email, password, 'login'),
    signUp: (email, password) => establish(email, password, 'register'),
    signOut: () => { window.localStorage.removeItem('nagardrishti-token'); setUser(null); setToken(null) },
  }), [token, user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

function useHazards(category = '') {
  const [items, setItems] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => {
      setLoading(true)
      setError('')
      fetchHazards(category)
        .then(result => { if (active) setItems(result.items) })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Reports could not be loaded.') })
        .finally(() => { if (active) setLoading(false) })
    }
    load()
    const timer = window.setInterval(load, 30000)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refreshWhenVisible) }
  }, [category, revision])
  return { items, loading, error, retry: () => setRevision(value => value + 1) }
}

function App() {
  return <AuthProvider><Application /></AuthProvider>
}

function Application() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [lightTheme, setLightTheme] = useState(() => window.localStorage.getItem('nagardrishti-theme') === 'light')
  const location = useLocation()
  const { user } = useAuth()
  const appNavigation = /^\/(app|explore|navigation|detection|reports|profile|admin|government|state-monitoring|complaints|community)/.test(location.pathname)
  useEffect(() => { setMenuOpen(false); setNotificationsOpen(false) }, [location.pathname])
  useEffect(() => {
    document.documentElement.dataset.theme = lightTheme ? 'light' : 'forest'
    window.localStorage.setItem('nagardrishti-theme', lightTheme ? 'light' : 'forest')
  }, [lightTheme])

  return <div className="app-shell">
    <header className="topbar">
      <Link to="/" className="brand" aria-label="NagarDrishti AI home">
        <span className="brand-mark"><Flower2 size={22} strokeWidth={1.5} /></span>
        <span>NAGARDRISHTI<span className="brand-ai"> AI</span><small>SMARTER ROADS · GREENER CITIES</small></span>
      </Link>
      <button className="mobile-menu" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="main-navigation" className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/explore">Explore map</NavLink>
        <NavLink to="/navigation">Smart routes</NavLink>
        <NavLink to="/detection">AI detection</NavLink>
        <NavLink to="/reports">My reports</NavLink>
        <details className="nav-dropdown"><summary>Community <ChevronDown size={13} /></summary><div className="nav-dropdown-menu"><NavLink to="/community">Community updates</NavLink><NavLink to="/complaints">State-level complaints</NavLink></div></details>
        <details className="nav-dropdown"><summary>Government <ChevronDown size={13} /></summary><div className="nav-dropdown-menu"><NavLink to="/government">Government portal</NavLink><NavLink to="/state-monitoring">State monitoring</NavLink><NavLink to="/admin">Admin dashboard <span className="nav-restricted">RESTRICTED</span></NavLink></div></details>
      </nav>
      <div className="top-actions">
        <div className="notification-control">
          <button type="button" className="header-icon-button" aria-label="Open notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(open => !open)}><Bell size={17} /></button>
          {notificationsOpen && <div className="notification-popover" role="status"><b>Notifications are not configured</b><p>Community updates load from saved reports. No authority notices or user alerts are connected.</p><Link to="/community" onClick={() => setNotificationsOpen(false)}>Open community updates <ArrowRight size={14} /></Link></div>}
        </div>
        <button type="button" className="header-icon-button theme-toggle" aria-label={lightTheme ? 'Switch to forest theme' : 'Switch to light theme'} aria-pressed={lightTheme} onClick={() => setLightTheme(value => !value)}>{lightTheme ? <Moon size={17} /> : <Sun size={17} />}</button>
        <Link to="/report" className="button button-gold button-small"><Plus size={16} /> Report a hazard</Link>
        <Link to={user ? '/profile' : '/signin'} className="avatar" aria-label={user ? `Profile: ${user.email}` : 'Sign in'} title={user?.email || 'Sign in'}>{user ? user.email.slice(0, 1).toUpperCase() : <UserRound size={17} />}</Link>
      </div>
    </header>

    {appNavigation && <DesktopSidebar />}
    <div className={`app-content${appNavigation ? ' with-sidebar' : ''}`}><Routes>
      <Route path="/" element={<Home />} />
      <Route path="/app" element={<Dashboard />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/navigation" element={<NavigationPage />} />
      <Route path="/detection" element={<DetectionPage />} />
      <Route path="/report" element={<ReportPage />} />
      <Route path="/reports" element={<MyReports />} />
      <Route path="/reports/:reportId" element={<ReportDetails />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/signin" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="register" />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/government" element={<Suspense fallback={<main className="app-page"><LoadingState label="Loading government portal" /></main>}><GovernmentPortalPage /></Suspense>} />
      <Route path="/state-monitoring" element={<Suspense fallback={<main className="app-page"><LoadingState label="Loading state monitoring" /></main>}><StateMonitoringPage /></Suspense>} />
      <Route path="/complaints" element={<Suspense fallback={<main className="app-page"><LoadingState label="Loading complaint workspace" /></main>}><StateComplaintsPage /></Suspense>} />
      <Route path="/community" element={<Suspense fallback={<main className="app-page"><LoadingState label="Loading community feed" /></main>}><CommunityUpdatesPage /></Suspense>} />
      <Route path="/how-it-works" element={<InfoPage kind="process" />} />
      <Route path="/about" element={<InfoPage kind="about" />} />
      <Route path="/privacy" element={<InfoPage kind="privacy" />} />
      <Route path="/hazards" element={<Explore />} />
      <Route path="*" element={<NotFound />} />
    </Routes></div>

    {appNavigation && <MobileNav />}
    <footer className="site-footer">
      <Link to="/" className="brand footer-brand"><span className="brand-mark"><Flower2 size={20} strokeWidth={1.5} /></span><span>NAGARDRISHTI<span className="brand-ai"> AI</span><small>SEE THE DANGER. FIND THE SAFER ROUTE.</small></span></Link>
      <span className="footer-note">Community observations · incomplete coverage · no live traffic feed</span>
      <div className="footer-links"><Link to="/government">Government</Link><Link to="/state-monitoring">State monitoring</Link><Link to="/complaints">Complaints</Link><Link to="/community">Community updates</Link><Link to="/admin">Admin</Link><Link to="/about">About</Link><Link to="/privacy">Privacy</Link><a href={`${API_BASE}/docs`} target="_blank" rel="noreferrer">API docs</a></div>
    </footer>
  </div>
}

function DesktopSidebar() {
  const entries = [
    { label: 'Dashboard', to: '/app', icon: <Activity size={17} /> },
    { label: 'Report a hazard', to: '/report', icon: <Plus size={17} /> },
    { label: 'Explore hazard map', to: '/explore', icon: <MapIcon size={17} /> },
    { label: 'AI road detection', to: '/detection', icon: <Sparkles size={17} /> },
    { label: 'Smart navigation', to: '/navigation', icon: <Navigation size={17} /> },
    { label: 'My reports', to: '/reports', icon: <Gauge size={17} /> },
    { label: 'Complaint letters', to: '/complaints', icon: <FileText size={17} /> },
    { label: 'Government portals', to: '/government', icon: <Building2 size={17} /> },
    { label: 'Community updates', to: '/community', icon: <Users size={17} /> },
    { label: 'Settings', to: '/profile', icon: <Settings size={17} /> },
  ]
  return <aside className="desktop-sidebar" aria-label="Application workspace">
    <span className="sidebar-eyebrow">YOUR WORKSPACE</span>
    <nav>{entries.map(entry => <NavLink key={entry.to} to={entry.to} end={entry.to === '/app'}>{entry.icon}<span>{entry.label}</span></NavLink>)}</nav>
    <div className="sidebar-footnote"><ShieldCheck size={15} /><span>Coverage depends on community reports. Unreported hazards may exist.</span></div>
  </aside>
}

function MobileNav() {
  return <nav className="mobile-bottom-nav" aria-label="Application navigation">
    <NavLink to="/app"><Activity size={18} /><span>Home</span></NavLink>
    <NavLink to="/explore"><MapIcon size={18} /><span>Map</span></NavLink>
    <NavLink to="/reports"><Gauge size={18} /><span>Reports</span></NavLink>
    <NavLink to="/profile"><UserRound size={18} /><span>Profile</span></NavLink>
  </nav>
}

function BrandPetal() { return <span className="petal-emblem"><Flower2 size={26} strokeWidth={1.35} /></span> }

function Home() {
  const navigate = useNavigate()
  const [slideIndex, setSlideIndex] = useState(0)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [searchPlace, setSearchPlace] = useState<ChosenPlace | null>(null)
  const { items, loading, error, retry } = useHazards()
  const recordedLabel = loading ? '…' : error ? '—' : String(items.length)
  const currentSlide = HERO_SLIDES[slideIndex]
  const verifiedReports = items.filter(item => item.status === 'verified')
  const reviewCount = items.filter(item => ['submitted', 'under_review'].includes(item.status)).length
  const setSlide = (direction: number) => {
    setSlideIndex(index => (index + direction + HERO_SLIDES.length) % HERO_SLIDES.length)
    setPhotoFailed(false)
  }
  const openSearchLocation = () => {
    if (!searchPlace) return
    const query = new URLSearchParams({ lat: String(searchPlace.point[0]), lon: String(searchPlace.point[1]), label: searchPlace.label })
    navigate(`/explore?${query.toString()}`)
  }
  return <main className="editorial-home">
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="gold-rule" /> A CLEARER VIEW OF THE ROADS WE SHARE</div>
        <BrandPetal />
        <p className="hero-kicker">NAGARDRISHTI AI</p>
        <p className="hero-project-tagline">See the Danger. Find the Safer Route.<br />Help Fix Every Road.</p>
        <h1>Safer roads.<br />Smarter cities.<br /><em>Brighter futures.</em></h1>
        <p className="hero-description">Road intelligence for the people who travel, report and care for their streets. Explore submitted hazards and help build a clearer picture together.</p>
        <div className="hero-actions">
          <Link to="/app" className="button button-gold">Get started <ArrowRight size={17} /></Link>
          <Link to="/explore" className="button button-outline-light"><MapIcon size={17} /> Explore the map</Link>
        </div>
        <div className="hero-caption"><ShieldCheck size={16} /> Community reports. Optional dataset consent. No fabricated predictions.</div>
        <a className="scroll-cue" href="#discover"><span /> Scroll to discover</a>
      </div>
      <div className={`hero-photo${photoFailed ? ' photo-fallback' : ''}`}>
        {!photoFailed && <img key={currentSlide.src} src={currentSlide.src} alt={currentSlide.alt} fetchPriority={slideIndex === 0 ? 'high' : 'auto'} onError={() => setPhotoFailed(true)} />}
        <div className="hero-photo-shade" />
        <div className="photo-caption"><span>EDITORIAL CITY PHOTOGRAPHY · NOT A REPORT IMAGE</span><a href={currentSlide.source} target="_blank" rel="noopener noreferrer">{currentSlide.credit} · Unsplash</a></div>
        <div className="hero-image-tools" aria-label="Hero road photography carousel">
          <button type="button" aria-label="Show previous road image" onClick={() => setSlide(-1)}><ChevronLeft size={17} /></button>
          <span aria-live="polite">{String(slideIndex + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}</span>
          <button type="button" aria-label="Show next road image" onClick={() => setSlide(1)}><ChevronRight size={17} /></button>
          <button type="button" className="change-image-button" onClick={() => setSlide(1)}>Change image</button>
        </div>
        <div className="hero-map-card">
          <div className="hero-map-head"><span><MapPin size={15} /> Community road intelligence</span><span className={`sync-state${error ? ' offline' : ''}`}><i />{loading ? 'SYNCING' : error ? 'OFFLINE' : 'CONNECTED'}</span></div>
          <MapView reports={items} height={200} className="hero-mini-map" />
          <div className="hero-map-foot"><strong>{recordedLabel}</strong><span>reports returned by the API</span><Link to="/explore" aria-label="Open interactive hazard map"><ArrowRight size={16} /></Link></div>
        </div>
        <div className="leaf-decoration leaf-decoration-one" aria-hidden="true"><Flower2 /></div>
      </div>
    </section>

    <section className="home-discovery section" aria-label="Find road reports">
      <div className="home-search-copy"><span className="eyebrow eyebrow-dark">START WITH A PLACE OR ISSUE</span><h2>Find the streets<br /><em>you want to know.</em></h2><p>Place search returns geocoder results. Hazard chips open matching records from the application backend.</p></div>
      <div className="home-search-panel"><PlaceLookup label="Search by area, road, or landmark" placeholder="Try a street or landmark in Kanpur" onChoose={setSearchPlace} />
        <button type="button" className="button button-forest full-button" disabled={!searchPlace} onClick={openSearchLocation}><MapIcon size={16} /> Open map at selected place</button>
        <div className="popular-searches" aria-label="Filter by reported hazard category"><span>Browse reports</span><div>{[{label:'Potholes', category:'pothole'}, {label:'Road cracks', category:'road_crack'}, {label:'Waterlogging', category:'waterlogging'}, {label:'Damaged surface', category:'damaged_surface'}].map(chip => <Link key={chip.category} to={`/explore?category=${chip.category}`}>{chip.label}</Link>)}</div></div>
      </div>
    </section>

    <section className="trust-strip" id="discover">
      <div><span className="trust-icon"><Crosshair size={19} /></span><span><b>See known hazards</b><small>Map markers come from saved reports</small></span></div>
      <div><span className="trust-icon"><RouteIcon size={19} /></span><span><b>Plan with context</b><small>Real provider geometry when available</small></span></div>
      <div><span className="trust-icon"><ShieldCheck size={19} /></span><span><b>Contribute by choice</b><small>Dataset consent is separate</small></span></div>
    </section>

    <section className="home-activity section" aria-labelledby="activity-title">
      <div className="section-heading"><div><div className="eyebrow eyebrow-dark">COMMUNITY ACTIVITY · BACKEND RECORDS</div><h2 id="activity-title">A clearer picture,<br /><em>one report at a time.</em></h2></div><Link to="/community" className="text-link">Open community feed <ArrowRight size={16} /></Link></div>
      <div className="home-stat-row" aria-label="Application reports returned by the backend">
        <article><span>REPORTS RETURNED</span><b>{recordedLabel}</b><small>From the current API response</small></article>
        <article><span>VERIFIED</span><b>{loading || error ? '—' : verifiedReports.length}</b><small>Records with verified status</small></article>
        <article><span>SUBMITTED / IN REVIEW</span><b>{loading || error ? '—' : reviewCount}</b><small>Current backend statuses</small></article>
      </div>
      {error && <RetryBanner message={error} onRetry={retry} />}
      <div className="home-feed-grid">
        <section className="cream-panel home-feed-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">LATEST SAVED RECORDS</span><h3>Recent reports</h3></div><Link to="/community" className="text-link">View all</Link></div>
          {loading ? <LoadingState label="Loading recent road reports" compact /> : !items.length ? <EmptyState icon={<MapPin />} title="No saved reports yet" text={error ? 'Recent reports are unavailable while the API is offline.' : 'The first saved report will appear here.'} action={<Link className="button button-forest button-small" to="/report">Report a hazard</Link>} /> : <div className="home-report-list">{items.slice(0, 3).map(report => <Link className="home-report-row" to={`/reports/${report.id}`} key={report.id}><span className="home-report-mark"><MapPin size={15} /></span><span><b>{CATEGORY_NAMES[report.category] || report.category}</b><small>{report.description || 'No description provided'} · {formatDate(report.created_at)}</small></span><span className={`status-tag status-${report.status}`}>{report.status.replaceAll('_', ' ')}</span></Link>)}</div>}
        </section>
        <section className="cream-panel home-feed-panel verified-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">STATUS FROM THE API</span><h3>Verified updates</h3></div><ShieldCheck size={18} /></div>
          {loading ? <LoadingState label="Loading verified reports" compact /> : !verifiedReports.length ? <EmptyState icon={<ShieldCheck />} title="No verified report returned" text={error ? 'Verification data is unavailable while the API is offline.' : 'This section only lists records whose backend status is verified.'} /> : <div className="home-report-list">{verifiedReports.slice(0, 3).map(report => <Link className="home-report-row" to={`/reports/${report.id}`} key={report.id}><span className="home-report-mark verified-mark"><Check size={15} /></span><span><b>{CATEGORY_NAMES[report.category] || report.category}</b><small>{report.description || 'No description provided'} · {formatDate(report.created_at)}</small></span><span className="status-tag status-verified">Verified</span></Link>)}</div>}
        </section>
      </div>
      <div className="home-government-row"><div><span className="eyebrow eyebrow-dark">OFFICIAL DESTINATIONS · CHECK JURISDICTION</span><h3>Government services</h3><p>These verified public portals open separately. NagarDrishti does not transmit your report or personal details.</p></div>
        <div className="home-government-links">{GOVERNMENT_PORTALS.map(portal => <a href={portal.url} target="_blank" rel="noopener noreferrer" key={portal.id}><span>{portal.label}</span><small>{portal.id === 'kmc' ? 'Municipal civic services' : portal.id === 'pwd' ? 'State roads and public works' : 'State grievance registration'}</small><ExternalLink size={15} /></a>)}</div>
      </div>
      <div className="home-letter-link"><span className="trust-icon"><FileText size={19} /></span><span><b>Need a formal letter?</b><small>Prepare and edit a local draft from a saved report. It will not submit automatically.</small></span><Link to="/complaints" className="button button-forest button-small">Complaint letter workspace <ArrowRight size={14} /></Link></div>
    </section>

    <section className="section feature-section">
      <div className="section-heading"><div><div className="eyebrow eyebrow-dark">FROM STREET TO SHARED INSIGHT</div><h2>Small observations.<br /><em>Meaningful change.</em></h2></div><Link to="/how-it-works" className="text-link">How it works <ArrowRight size={16} /></Link></div>
      <div className="feature-grid">
        <FeatureCard number="01" icon={<MapPin />} title="Report a hazard" text="Share a road image, choose its category and confirm its location before the report is saved." to="/report" action="Start a report" />
        <FeatureCard number="02" icon={<MapIcon />} title="Explore the map" text="Pan and zoom a real map. Report markers and details load from the application API." to="/explore" action="Explore reports" />
        <FeatureCard number="03" icon={<Navigation />} title="Plan a route" text="Request route alternatives from the configured routing provider and compare recorded hazards." to="/navigation" action="Plan a route" />
        <FeatureCard number="04" icon={<Sparkles />} title="Check AI readiness" text="See the backend model status. If inference is unavailable, the app says so without inventing results." to="/detection" action="Open detection" />
      </div>
    </section>
    <section className="cta-band"><span className="cta-mark"><Flower2 size={24} /></span><div><h2>Know a road that needs attention?</h2><p>Your photo is stored with the report. Dataset use remains an explicit, optional choice.</p></div><Link to="/report" className="button button-cream">Report a road hazard <ArrowRight size={16} /></Link></section>
  </main>
}

function FeatureCard({ number, icon, title, text, to, action }: { number: string; icon: ReactNode; title: string; text: string; to: string; action: string }) {
  return <article className="feature-card"><span className="feature-index">{number}</span><span className="feature-icon">{icon}</span><h3>{title}</h3><p>{text}</p><Link to={to}>{action} <ArrowRight size={14} /></Link></article>
}

type ChosenPlace = { label: string; point: [number, number] }
function coordinateInput(value: string): ChosenPlace | null {
  const match = value.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!match) return null
  const lat = Number(match[1]), lon = Number(match[2])
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, point: [lat, lon] }
}

function PlaceLookup({ label, placeholder, onChoose, initialValue = '' }: { label: string; placeholder: string; onChoose: (place: ChosenPlace) => void; initialValue?: string }) {
  const [query, setQuery] = useState(initialValue)
  const [results, setResults] = useState<Place[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  useEffect(() => { if (initialValue) setQuery(initialValue) }, [initialValue])
  const search = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setResults([]); setSearched(false)
    const coordinate = coordinateInput(query)
    if (coordinate) { onChoose(coordinate); setQuery(coordinate.label); setSearched(true); return }
    if (query.trim().length < 3) { setError('Enter a place name or latitude, longitude.'); return }
    setBusy(true)
    try {
      const places = await searchPlaces(query)
      setResults(places); setSearched(true)
      if (!places.length) setError('No matching places were returned. Try a nearby landmark or coordinates.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Place search is unavailable.') }
    finally { setBusy(false) }
  }
  const choose = (place: Place) => {
    const point: [number, number] = [Number(place.lat), Number(place.lon)]
    if (!point.every(Number.isFinite)) { setError('The place service returned invalid coordinates.'); return }
    const choice = { label: place.display_name, point }
    setQuery(place.display_name); setResults([]); onChoose(choice)
  }
  return <form className="place-lookup" onSubmit={search}>
    <label htmlFor={`lookup-${label.replace(/\W/g, '')}`}>{label}</label>
    <div className="lookup-control"><MapPin size={17} /><input id={`lookup-${label.replace(/\W/g, '')}`} value={query} onChange={event => { setQuery(event.target.value); setResults([]); setError(''); setSearched(false) }} placeholder={placeholder} autoComplete="off" /><button className="lookup-submit" type="submit" aria-label={`Search ${label}`} disabled={busy}>{busy ? <span className="spinner" /> : <Search size={17} />}</button></div>
    {error && <span className="field-error" role="alert">{error}</span>}
    {results.length > 0 && <ul className="place-results" aria-label={`${label} search results`}>{results.map(place => <li key={place.place_id}><button type="button" onClick={() => choose(place)}><MapPin size={15} /><span>{place.display_name}</span><ArrowRight size={14} /></button></li>)}</ul>}
    {searched && results.length === 0 && !error && <span className="field-help">Location coordinates selected.</span>}
    <span className="field-help">Search is requested when you submit the field; coordinates also work.</span>
    <span className="field-help">Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Nominatim</span>
  </form>
}

function Dashboard() {
  const { user } = useAuth()
  const { items, loading, error, retry } = useHazards()
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [selected, setSelected] = useState<Hazard | null>(null)
  return <main className="app-page dashboard-page">
    <div className="dashboard-welcome"><div><div className="eyebrow eyebrow-dark">NAGARDRISHTI · CITIZEN WORKSPACE</div><h1>Hello, Explorer<span>.</span></h1><p>Discover submitted road reports and contribute useful context for your community.</p></div><Link to="/report" className="button button-forest"><Plus size={17} /> Report a hazard</Link></div>
    <PlaceLookup label="Search a place" placeholder="Search city, street or enter latitude, longitude" onChoose={place => { setCenter(place.point); setSelected(null) }} />
    <div className="dashboard-map-layout">
      <section className="map-panel dashboard-map-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">LIVE COMMUNITY REPORTS</span><h2>Road hazard map</h2></div><span className={`data-badge${error ? ' data-error' : ''}`}><i />{loading ? 'Loading' : error ? 'Unavailable' : `${items.length} reports`}</span></div>
        {error && <RetryBanner message={error} onRetry={retry} />}
        <MapView reports={items} center={center} zoom={13} selectedId={selected?.id} onSelect={setSelected} height={430} />
        <div className="map-coverage-note"><ShieldCheck size={16} /> Coverage depends on submitted reports. Unreported hazards may still exist.</div>
      </section>
      <aside className="dashboard-side">
        <div className="cream-panel welcome-note"><span className="welcome-flower"><Flower2 size={22} /></span><div className="eyebrow eyebrow-dark">YOUR ROAD COMMUNITY</div><p>{user ? `Signed in as ${user.email}.` : 'Sign in to keep your own submitted reports together.'}</p>{user ? <Link to="/reports" className="text-link">View my reports <ArrowRight size={15} /></Link> : <Link to="/signin" className="text-link">Sign in or create an account <ArrowRight size={15} /></Link>}</div>
        <div className="quick-actions"><h2>What would you like to do?</h2><Link to="/report"><span className="action-symbol action-amber"><MapPin size={18} /></span><span><b>Report a hazard</b><small>Upload a photo and confirm location</small></span><ArrowRight size={16} /></Link><Link to="/navigation"><span className="action-symbol action-green"><Navigation size={18} /></span><span><b>Plan a route</b><small>Compare provider routes and known reports</small></span><ArrowRight size={16} /></Link><Link to="/detection"><span className="action-symbol action-moss"><Sparkles size={18} /></span><span><b>AI detection</b><small>Check whether a real model is configured</small></span><ArrowRight size={16} /></Link></div>
        <div className="cream-panel coverage-card"><span className="coverage-ornament"><Flower2 size={23} /></span><strong>{loading ? '—' : error ? 'Unavailable' : items.length}</strong><span>reports returned by the backend</span><small>Community coverage is incomplete and does not represent all road conditions.</small></div>
      </aside>
    </div>
  </main>
}

function RetryBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="retry-banner" role="alert"><span>{message}</span><button type="button" className="button button-quiet" onClick={onRetry}><RefreshCw size={15} /> Retry</button></div>
}

function Explore() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') || ''
  const [filter, setFilter] = useState(() => CATEGORY_FILTERS.some(item => item.value === initialCategory) ? initialCategory : '')
  const { items, loading, error, retry } = useHazards(filter)
  const [selected, setSelected] = useState<Hazard | null>(null)
  const initialLat = Number(searchParams.get('lat'))
  const initialLon = Number(searchParams.get('lon'))
  const [center, setCenter] = useState<[number, number] | null>(() => Number.isFinite(initialLat) && Number.isFinite(initialLon) && Math.abs(initialLat) <= 90 && Math.abs(initialLon) <= 180 ? [initialLat, initialLon] : null)
  const [severityFilter, setSeverityFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('')
  const [view, setView] = useState<'map' | 'list'>('map')
  const visibleItems = useMemo(() => items.filter(item => {
    const severityMatch = !severityFilter || (severityFilter === 'high' ? ['high', 'urgent'].includes(item.severity) : item.severity === severityFilter)
    const verificationMatch = !verificationFilter || (verificationFilter === 'verified' ? item.status === 'verified' : verificationFilter === 'unverified' ? item.status !== 'verified' : item.status === verificationFilter)
    const days = dateFilter ? Number(dateFilter) : 0
    const dateMatch = !days || Date.now() - new Date(item.created_at).getTime() <= days * 86400000
    return severityMatch && verificationMatch && dateMatch
  }), [items, severityFilter, dateFilter, verificationFilter])
  return <main className="app-page explore-page">
    <PageIntro eyebrow="COMMUNITY ROAD INTELLIGENCE" title="Explore the map" description="Browse the reports that have actually been submitted to the backend." action={<Link to="/report" className="button button-forest"><Plus size={17} /> New report</Link>} />
    <div className="map-filter-toolbar">
      <div className="filter-row" aria-label="Filter reports by category">{CATEGORY_FILTERS.map(item => <button key={item.value || 'all'} className={`filter-chip${filter === item.value ? ' active' : ''}`} type="button" aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setSelected(null); setSearchParams(current => { const next = new URLSearchParams(current); if (item.value) next.set('category', item.value); else next.delete('category'); return next }) }}>{item.label}</button>)}</div>
      <div className="secondary-map-filters">
        <label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option value="">Any assessed severity</option><option value="high">High / urgent</option><option value="moderate">Moderate</option><option value="low">Low</option><option value="unrated">Not assessed</option></select></label>
        <label>Date<select value={dateFilter} onChange={event => setDateFilter(event.target.value)}><option value="">Any date</option><option value="30">Past 30 days</option><option value="90">Past 90 days</option></select></label>
        <label>Verification<select value={verificationFilter} onChange={event => setVerificationFilter(event.target.value)}><option value="">Any status</option><option value="verified">Verified</option><option value="unverified">Not verified</option><option value="resolved">Resolved</option></select></label>
        <button className="view-toggle" type="button" onClick={() => setView(value => value === 'map' ? 'list' : 'map')}><Layers2Icon /> {view === 'map' ? 'List view' : 'Map view'}</button>
      </div>
    </div>
    {error && <RetryBanner message={error} onRetry={retry} />}
    <div className={`explore-layout${view === 'list' ? ' list-only' : ''}`}>
      {view === 'map' && <section className="map-panel explore-map-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">INTERACTIVE MAP</span><h2>Reported road hazards</h2></div><span className={`data-badge${error ? ' data-error' : ''}`}><i />{loading ? 'Loading reports' : `${visibleItems.length} shown`}</span></div><MapView reports={visibleItems} center={center} zoom={12} selectedId={selected?.id} onSelect={setSelected} height="min(67vh, 640px)" />
        <div className="map-legend" aria-label="Map marker legend"><span><i className="legend-red" /> High / urgent self-assessed</span><span><i className="legend-amber" /> Reported / under review</span><span><i className="legend-green" /> Resolved</span></div>
        <div className="nearby-map-search"><span>Search nearby in Google Maps</span><a href={googleMapsSearchUrl('potholes near me')} target="_blank" rel="noopener noreferrer">Potholes</a><a href={googleMapsSearchUrl('road damage near me')} target="_blank" rel="noopener noreferrer">Road damage</a><a href={googleMapsSearchUrl('waterlogging flooded roads near me')} target="_blank" rel="noopener noreferrer">Waterlogging</a></div>
        <div className="map-coverage-note"><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map issue</a><span>·</span><span>Coverage depends on available submissions.</span></div></section>}
      <aside className="report-list-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">DATABASE RECORDS</span><h2>{loading ? 'Loading reports' : `${visibleItems.length} of ${items.length} reports`}</h2></div>{loading && <span className="spinner" />}</div>
        {loading ? <LoadingState label="Loading real report records" /> : !visibleItems.length ? <EmptyState icon={<MapPin />} title="No reports match these filters" text={error ? 'The report service could not be reached.' : items.length ? 'Adjust severity, date, verification, or category to see other saved reports.' : 'New submitted reports will appear here.'} /> : <div className="report-list">{visibleItems.map(item => <button key={item.id} type="button" className={`report-row${selected?.id === item.id ? ' selected' : ''}`} onClick={() => { setSelected(item); setCenter([item.latitude, item.longitude]) }}><span className={`hazard-glyph glyph-${item.category.replaceAll('_', '-')}`}><MapPin size={16} /></span><span className="report-row-copy"><b>{CATEGORY_NAMES[item.category] || item.category}</b><small>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</small><small>{item.severity === 'unrated' ? 'Severity not assessed' : `${item.severity} · citizen assessment`} · {item.status.replaceAll('_', ' ')} · {formatDate(item.created_at)}</small></span><ArrowRight size={16} /></button>)}</div>}
        {selected && <div className="selected-report-card"><button type="button" aria-label="Clear selected report" className="close-button" onClick={() => setSelected(null)}><X size={16} /></button><span className="eyebrow eyebrow-dark">SELECTED REPORT</span><h3>{CATEGORY_NAMES[selected.category] || selected.category}</h3><p>{selected.description || 'No description was provided.'}</p><small>{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)} · {selected.severity === 'unrated' ? 'Severity not assessed' : `${selected.severity} citizen assessment`}</small><span className={`status-tag status-${selected.status}`}>{selected.status.replaceAll('_', ' ')}</span><Link to={`/reports/${selected.id}`} className="text-link">Open details <ArrowRight size={14} /></Link><a className="text-link" href={googleMapsSearchUrl(`${selected.latitude}, ${selected.longitude} road damage`)} target="_blank" rel="noopener noreferrer">Open location in Google Maps <ExternalLink size={14} /></a></div>}
        <div className="limited-note"><ShieldCheck size={16} /> Map coverage depends on available reports; unreported hazards may exist.</div>
      </aside>
    </div>
  </main>
}

function Layers2Icon() { return <span className="layers-icon" aria-hidden="true"><span /><span /><span /></span> }

function ReportPage() {
  const { token, user } = useAuth()
  const location = useLocation()
  const navigationState = location.state as { file?: File } | null
  const imageInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(navigationState?.file || null)
  const [preview, setPreview] = useState('')
  const [category, setCategory] = useState('pothole')
  const [severity, setSeverity] = useState<'unrated' | 'low' | 'moderate' | 'high' | 'urgent'>('unrated')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Hazard | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  const chooseFile = (candidate?: File) => {
    if (!candidate) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) { setError('Choose a JPEG, PNG or WebP image.'); return }
    if (candidate.size > 8 * 1024 * 1024) { setError('Image must be smaller than 8 MB.'); return }
    setFile(candidate); setCreated(null)
  }
  const locate = () => {
    setError('')
    if (!navigator.geolocation) { setError('Location access is unavailable in this browser. Enter coordinates or select a point on the map.'); return }
    navigator.geolocation.getCurrentPosition(position => {
      const lat = position.coords.latitude, lon = position.coords.longitude
      setLatitude(lat.toFixed(6)); setLongitude(lon.toFixed(6)); setMapCenter([lat, lon])
    }, () => setError('Location permission was not granted. Enter coordinates or choose a map point.'), { enableHighAccuracy: true, timeout: 10000 })
  }
  const pickPoint = (point: [number, number]) => { setLatitude(point[0].toFixed(6)); setLongitude(point[1].toFixed(6)); setMapCenter(point); setError('') }
  const drop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]) }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setCreated(null)
    if (!file) { setError('Add a road image before submitting.'); return }
    const lat = Number(latitude), lon = Number(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { setError('Enter valid latitude and longitude or select a point on the map.'); return }
    const form = new FormData()
    form.append('image', file); form.append('category', category); form.append('description', description)
    form.append('latitude', String(lat)); form.append('longitude', String(lon)); form.append('severity', severity); form.append('dataset_consent', String(consent))
    setBusy(true)
    try {
      const result = await submitReport(form, token)
      setCreated(result); setFile(null); setDescription(''); setConsent(false); setSeverity('unrated')
      if (imageInput.current) imageInput.current.value = ''
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The report service could not be reached. Your report was not confirmed.') }
    finally { setBusy(false) }
  }

  return <main className="app-page report-page">
    <PageIntro eyebrow="HELP MAKE ROADS MORE VISIBLE" title="Report a road hazard" description="Share evidence and confirm where you saw the issue. Dataset participation is optional." />
    <div className="report-workspace"><form className="report-form" onSubmit={submit}>
      <section className="form-section"><FormSection number="01" title="Road photo" text="Use a clear picture of the road condition." />
        <label className={`upload-box${preview ? ' has-image' : ''}`} htmlFor="road-image" onDragOver={event => event.preventDefault()} onDrop={drop}>
          {preview ? <><img src={preview} alt="Preview of selected road photo" /><span className="replace-image"><Upload size={16} /> Replace photo</span></> : <><span className="upload-icon"><Upload size={22} /></span><b>Choose or drop a road photo</b><small>JPEG, PNG or WebP · maximum 8 MB</small></>}
          <input id="road-image" ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => chooseFile(event.target.files?.[0])} />
        </label>
        {file && <button type="button" className="text-button remove-photo" onClick={() => { setFile(null); if (imageInput.current) imageInput.current.value = '' }}>Remove photo</button>}
      </section>
      <section className="form-section"><FormSection number="02" title="Confirm location" text="Choose your current location, enter coordinates, or click the map." />
        <button type="button" className="button button-outline locate-button" onClick={locate}><LocateFixed size={17} /> Use my current location</button>
        <div className="two-fields"><label>Latitude<input className="field" type="number" min="-90" max="90" step="any" value={latitude} onChange={event => setLatitude(event.target.value)} placeholder="12.9716" required /></label><label>Longitude<input className="field" type="number" min="-180" max="180" step="any" value={longitude} onChange={event => setLongitude(event.target.value)} placeholder="77.5946" required /></label></div>
        <div className="report-picker-map"><MapView center={mapCenter || (latitude && longitude ? [Number(latitude), Number(longitude)] : null)} zoom={latitude && longitude ? 15 : 5} origin={latitude && longitude ? [Number(latitude), Number(longitude)] : null} onPick={pickPoint} height={270} /></div>
      </section>
      <section className="form-section"><FormSection number="03" title="Report details" text="Choose the closest category and share helpful context." />
        <label className="form-label">Hazard category<select className="field" value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(CATEGORY_NAMES).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label>
        <label className="form-label">Severity assessment <span className="optional">Your assessment</span><select className="field" value={severity} onChange={event => setSeverity(event.target.value as typeof severity)}><option value="unrated">Not assessed</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="urgent">Urgent</option></select><small className="field-help">This is self-reported context, not an official hazard verification or an AI prediction.</small></label>
        <label className="form-label">Description <span className="optional">Optional</span><textarea className="field textarea" maxLength={2000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Nearby landmarks or what makes this location hazardous." /></label>
        <label className="consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span className="checkmark"><Check size={13} /></span><span><b>Allow this image to be considered for dataset review</b><small>Optional. The report is submitted either way. Consent creates a review contribution; it does not automatically train a model.</small></span></label>
      </section>
      <div className="privacy-note"><ShieldCheck size={18} /><span><b>Report and dataset consent are separate.</b> Your report is saved only after the backend confirms the submission. No government complaint is sent by this prototype.</span></div>
      {error && <div className="form-alert error-alert" role="alert">{error}</div>}
      {created && <div className="form-alert success-alert" role="status"><Check size={17} /><span>Report saved. ID <code>{created.id}</code> · status <b>{created.status}</b>.{user ? <Link to="/reports"> View my reports</Link> : ' You submitted anonymously; sign-in is needed for personal report history.'}</span></div>}
      <div className="form-submit"><span>By submitting, you confirm you have the right to share this image.</span><button className="button button-forest" disabled={busy}>{busy ? 'Saving report…' : 'Submit report'} <ArrowRight size={16} /></button></div>
    </form><aside className="report-aside"><div className="cream-panel report-aside-card"><BrandPetal /><div className="eyebrow eyebrow-dark">BEFORE YOU SUBMIT</div><h2>A useful report starts with a clear location.</h2><ul><li><Check size={15} /> Photo is required</li><li><Check size={15} /> Coordinates are validated</li><li><Check size={15} /> Dataset consent is optional</li></ul><p>Map coverage depends on existing road reports. The map tile and geocoding services can be temporarily unavailable.</p></div><Link to="/privacy" className="text-link">Read how reports are handled <ArrowRight size={14} /></Link></aside></div>
  </main>
}

function FormSection({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="form-section-heading"><span className="form-step">{number}</span><div><h2>{title}</h2><p>{text}</p></div></div>
}

function DetectionPage() {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [statusError, setStatusError] = useState('')
  const [checking, setChecking] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const navigate = useNavigate()
  const loadStatus = async () => {
    setChecking(true); setStatusError('')
    try { setStatus(await fetchModelStatus()) }
    catch (reason) { setStatus(null); setStatusError(reason instanceof Error ? reason.message : 'Model status could not be loaded.') }
    finally { setChecking(false) }
  }
  useEffect(() => { void loadStatus() }, [])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file); setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  const selectImage = (image?: File) => {
    if (!image) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) { setStatusError('Choose a JPEG, PNG or WebP image.'); return }
    if (image.size > 8 * 1024 * 1024) { setStatusError('Image must be smaller than 8 MB.'); return }
    setStatusError(''); setFile(image)
  }
  const handoff = () => { if (file) navigate('/report', { state: { file } }) }
  return <main className="app-page detection-page">
    <PageIntro eyebrow="VISION SERVICE STATUS" title="AI road damage detection" description="Upload an image to preview it and check the configured model. Predictions appear only when a real inference service returns them." />
    <div className="detection-layout"><section className="detection-preview-panel">
      <div className="panel-heading"><div><span className="eyebrow eyebrow-dark">IMAGE PREVIEW</span><h2>Road image</h2></div>{file && <button type="button" className="text-button" onClick={() => setFile(null)}>Remove image</button>}</div>
      <label className={`detection-dropzone${preview ? ' has-image' : ''}`} htmlFor="detection-image">
        {preview ? <img src={preview} alt="Selected road image; no analysis has been performed" /> : <><span className="upload-icon"><Upload size={22} /></span><b>Choose a road image</b><small>JPEG, PNG or WebP · maximum 8 MB</small></>}
        <input id="detection-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => selectImage(event.target.files?.[0])} />
      </label>
      <p className="field-help">This image stays in your browser until you continue to the report form. It has not been sent for analysis.</p>
    </section><aside className="detection-results cream-panel">
      <div className="eyebrow eyebrow-dark">ACTUAL BACKEND RESPONSE</div><h2>Detection readiness</h2>
      {checking ? <LoadingState label="Checking model status" compact /> : statusError ? <div className="inline-error" role="alert">{statusError}</div> : status?.model_available ? <div className="model-warning"><span className="model-status-dot ready" /><div><b>Model reported available</b><p>{status.reason}</p><small>This API does not expose direct image upload inference for unsaved images, so no prediction was requested.</small></div></div> : <div className="model-warning"><span className="model-status-dot" /><div><b>Model unavailable</b><p>{status?.reason || 'The model status service did not return an availability result.'}</p><small>No prediction or confidence value has been fabricated.</small></div></div>}
      {status?.model_version && <div className="model-meta"><span>Model version</span><b>{status.model_version}</b></div>}
      {status?.supported_classes?.length ? <div className="model-meta"><span>Supported classes</span><b>{status.supported_classes.join(', ')}</b></div> : <div className="model-meta"><span>Predictions</span><b>None returned</b></div>}
      {statusError && <button type="button" className="button button-outline" onClick={() => void loadStatus()} disabled={checking}><RefreshCw size={15} /> Retry status</button>}
      <button type="button" className="button button-forest detection-submit" onClick={handoff} disabled={!file}>Continue to human report <ArrowRight size={16} /></button>
      <button type="button" className="text-button analyze-another" onClick={() => { setFile(null); setStatusError(''); void loadStatus() }}>Analyse another image</button>
      <p className="small-print">The existing API analyzes stored report images only. This interface does not create a report or claim inference success.</p>
    </aside></div>
  </main>
}

function ActiveNavigationPanel({ route, onStop }: { route: RouteOption; onStop: () => void }) {
  const [active, setActive] = useState(false)
  const [warningDistance, setWarningDistance] = useState(120)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [notice, setNotice] = useState('Start navigation to request location permission. Monitoring stops when you stop this session or leave this page.')
  const [alert, setAlert] = useState<{ hazard: RouteHazard; distance: number } | null>(null)
  const watchId = useRef<number | null>(null)
  const alertedReportIds = useRef(new Set<string>())

  const stop = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setActive(false)
    setAlert(null)
    setNotice('Navigation stopped. Location monitoring is off.')
    onStop()
  }

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  const assessPosition = (nextPosition: [number, number]) => {
    setPosition(nextPosition)
    const currentIndex = nearestRoutePointIndex(nextPosition, route)
    const nearby = route.hazards
      .map(hazard => ({ hazard, distance: metresBetween(nextPosition, [hazard.latitude, hazard.longitude]), routeIndex: nearestRoutePointIndex([hazard.latitude, hazard.longitude], route) }))
      .filter(item => item.distance <= warningDistance && item.routeIndex >= Math.max(0, currentIndex - 1))
      .sort((a, b) => a.distance - b.distance)[0]
    if (!nearby) {
      setNotice(`No active route report is within ${warningDistance} m of the latest location update.`)
      return
    }
    if (alertedReportIds.current.has(nearby.hazard.id)) {
      setNotice(`A reported ${CATEGORY_NAMES[nearby.hazard.category] || nearby.hazard.category} remains nearby. Continue carefully.`)
      return
    }
    alertedReportIds.current.add(nearby.hazard.id)
    setAlert(nearby)
    setNotice(`Road hazard ahead: reported ${CATEGORY_NAMES[nearby.hazard.category] || nearby.hazard.category} about ${Math.round(nearby.distance)} m away. Slow down and continue carefully.`)
    if (soundEnabled && !playSafetyTone()) setNotice(`Road hazard ahead about ${Math.round(nearby.distance)} m away. The visual warning is active; browser audio was unavailable.`)
  }

  const start = () => {
    if (!navigator.geolocation) { setNotice('Geolocation is unavailable in this browser. You can still compare routes, but proximity warnings cannot start.'); return }
    alertedReportIds.current.clear()
    setAlert(null)
    setNotice('Requesting location permission for this navigation session…')
    navigator.geolocation.getCurrentPosition(current => {
      setActive(true)
      assessPosition([current.coords.latitude, current.coords.longitude])
      watchId.current = navigator.geolocation.watchPosition(update => assessPosition([update.coords.latitude, update.coords.longitude]), () => {
        setNotice('Location updates were interrupted. Proximity warnings are no longer being refreshed.')
        setActive(false)
      }, { enableHighAccuracy: true, maximumAge: 12_000, timeout: 15_000 })
    }, () => setNotice('Location permission was not granted. Proximity warnings remain off; use the route map and reported-hazard list instead.'), { enableHighAccuracy: true, timeout: 15_000 })
  }

  return <section className={`active-navigation${active ? ' is-active' : ''}`} aria-label="Proximity warning controls">
    <div className="active-navigation-head"><span className="eyebrow eyebrow-dark">PROXIMITY WARNINGS</span><span className={`navigation-state${active ? ' live' : ''}`}>{active ? 'Location monitoring on' : 'Off'}</span></div>
    {alert && <div className="hazard-proximity-alert" role="alert"><ShieldCheck size={18} /><div><b>Road hazard ahead</b><span>{CATEGORY_NAMES[alert.hazard.category] || alert.hazard.category} · about {Math.round(alert.distance)} m away · report {alert.hazard.id.slice(0, 8)}</span></div></div>}
    <p className="navigation-notice" aria-live="polite">{notice}</p>
    {position && <small className="navigation-location">Latest position: {position[0].toFixed(5)}, {position[1].toFixed(5)}. Only this session uses live location updates.</small>}
    <div className="navigation-settings"><label>Alert distance <select value={warningDistance} onChange={event => setWarningDistance(Number(event.target.value))} disabled={active}><option value={75}>75 m</option><option value={120}>120 m</option><option value={200}>200 m</option><option value={350}>350 m</option></select></label><label className="sound-toggle"><input type="checkbox" checked={soundEnabled} onChange={event => setSoundEnabled(event.target.checked)} /> Sound when a new report is close</label></div>
    <div className="navigation-actions">{active ? <button type="button" className="button button-danger button-small" onClick={stop}>Stop navigation</button> : <button type="button" className="button button-forest button-small" onClick={start}>Start navigation</button>}<button type="button" className="button button-outline button-small" onClick={() => setNotice(playSafetyTone() ? 'Alarm test played. Audible playback can be blocked until a browser receives a user gesture.' : 'Visual alarm test complete. This browser does not currently provide Web Audio.')}>Test alarm</button></div>
    <small className="navigation-disclaimer">Use this only before driving or with a passenger. It warns about active reported hazards near simplified route geometry; GPS, map matching and report coverage can be incomplete. It cannot monitor in the background once the browser is suspended.</small>
  </section>
}

function NavigationPage() {
  const { items: hazards, loading: hazardsLoading, error: hazardsError, retry: retryHazards } = useHazards()
  const [origin, setOrigin] = useState<ChosenPlace | null>(null)
  const [destination, setDestination] = useState<ChosenPlace | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [routeError, setRouteError] = useState('')
  const [useCurrent, setUseCurrent] = useState(false)
  const [googleTravelMode, setGoogleTravelMode] = useState<'driving' | 'walking'>('driving')
  const [permissionError, setPermissionError] = useState('')
  const activeHazards = hazards.filter(hazard => !['resolved', 'rejected'].includes(hazard.status))
  const plan = async () => {
    setMessage(''); setRouteError(''); setRoutes([]); setSelectedId(null)
    if (!origin || !destination) { setRouteError('Search for both an origin and destination before requesting routes.'); return }
    setBusy(true)
    try {
      const result = await fetchRoutes(origin.point, destination.point)
      setRoutes(result.routes)
      setSelectedId(result.routes.find(route => route.recommended)?.id || result.routes[0]?.id || null)
      setMessage(result.explanation)
      if (!result.routes.length) setRouteError('The routing service returned no route for these locations.')
    } catch (reason) { setRouteError(reason instanceof Error ? reason.message : 'The routing service could not be reached.') }
    finally { setBusy(false) }
  }
  const setCurrentLocation = () => {
    setPermissionError('')
    if (!navigator.geolocation) { setPermissionError('Geolocation is unavailable. Search for a place or enter coordinates instead.'); return }
    navigator.geolocation.getCurrentPosition(position => {
      const point: [number, number] = [position.coords.latitude, position.coords.longitude]
      setOrigin({ label: 'Current location', point }); setUseCurrent(true)
    }, () => setPermissionError('Location permission was not granted. You can search for a place or enter coordinates.'), { enableHighAccuracy: true, timeout: 10000 })
  }
  const selected = routes.find(route => route.id === selectedId) || null
  return <main className="app-page navigation-page">
    <PageIntro eyebrow="REAL ROUTE GEOMETRY · KNOWN REPORTS" title="Plan with more context" description="Compare routes returned by the configured routing provider. Nearby report totals come from actual stored hazards." action={<span className="coverage-pill"><i /> Incomplete hazard coverage</span>} />
    <div className="navigation-layout"><section className="map-panel route-map-panel"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">ROUTE MAP</span><h2>{selected ? 'Selected provider route' : 'Search to request a route'}</h2></div><span className={`data-badge${hazardsError ? ' data-error' : ''}`}><i />{hazardsLoading ? 'Loading reports' : hazardsError ? 'Reports unavailable' : `${activeHazards.length} active reports`}</span></div>
      {routeError && <RetryBanner message={routeError} onRetry={() => { void plan() }} />}
      {hazardsError && <RetryBanner message={hazardsError} onRetry={retryHazards} />}
      <MapView reports={activeHazards} routes={routes} selectedRouteId={selectedId} onRouteSelect={setSelectedId} origin={origin?.point || null} destination={destination?.point || null} center={null} height="min(66vh, 620px)" />
      <div className="map-coverage-note"><span>Routes show provider geometry, not live traffic. Unreported road hazards may exist.</span></div>
      {!!routes.length && <div className="route-options" role="list" aria-label="Returned route options">{routes.map((route, index) => <button type="button" role="listitem" key={route.id} className={`route-option${route.id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(route.id)}><span className="route-option-index">{index + 1}</span><span className="route-option-main"><b>{route.recommended ? 'Recommended balance' : `Alternative ${index + 1}`}</b><small>{(route.distance_m / 1000).toFixed(1)} km · {Math.round(route.duration_s / 60)} min</small></span><span className="route-option-hazards">{route.hazard_count} reports<small>{route.verified_hazard_count} verified</small></span></button>)}</div>}
    </section><aside className="route-form-card"><div className="route-card-title"><span className="route-icon"><Navigation size={18} /></span><div><h2>Journey details</h2><p>Search a place or provide latitude, longitude.</p></div></div>
      <div>
        <PlaceLookup label="Origin" placeholder="City, address or 12.9716, 77.5946" onChoose={place => { setOrigin(place); setUseCurrent(false) }} initialValue={useCurrent ? 'Current location' : ''} />
        <button type="button" className="text-button current-location" onClick={setCurrentLocation}><LocateFixed size={15} /> Use my current location</button>
        <PlaceLookup label="Destination" placeholder="City, address or 12.9352, 77.6245" onChoose={setDestination} />
        {permissionError && <div className="field-error" role="alert">{permissionError}</div>}
        <button type="button" className="button button-forest full-button" onClick={() => { void plan() }} disabled={busy}>{busy ? 'Requesting route…' : 'Compare route options'} <ArrowRight size={16} /></button>
      </div>
      {routeError && <div className="inline-error" role="alert">{routeError}</div>}
      {message && !routeError && <div className="route-provider-note" role="status">{message}</div>}
      {selected && <div className="selected-route-summary"><span className="eyebrow eyebrow-dark">SELECTED ROUTE</span><strong>{(selected.distance_m / 1000).toFixed(1)} km <span>·</span> {Math.round(selected.duration_s / 60)} min</strong><p>{selected.hazard_count} active reported hazards near the route · {selected.verified_hazard_count} verified reports</p>{selected.hazards.length > 0 && <ul className="route-hazard-evidence">{selected.hazards.map(hazard => <li key={hazard.id}><Link to={`/reports/${hazard.id}`}>{CATEGORY_NAMES[hazard.category] || hazard.category}</Link><span>{hazard.severity === 'unrated' ? 'severity not assessed' : `${hazard.severity} citizen assessment`} · {hazard.distance_to_route_m} m from route · {formatDate(hazard.created_at)}</span></li>)}</ul>}</div>}
      {selected && <ActiveNavigationPanel key={selected.id} route={selected} onStop={() => undefined} />}
      {origin && destination && <div className="google-directions-card"><label>Google Maps mode<select value={googleTravelMode} onChange={event => setGoogleTravelMode(event.target.value as typeof googleTravelMode)}><option value="driving">Driving</option><option value="walking">Walking</option></select></label><a className="button button-outline button-small" href={googleMapsDirectionsUrl(origin.point.join(', '), destination.point.join(', '), googleTravelMode)} target="_blank" rel="noopener noreferrer">Open endpoints in Google Maps <ExternalLink size={14} /></a><small>Google Maps opens separately. NagarDrishti hazard markers and route geometry are not sent to Google.</small></div>}
      <div className="route-warning"><ShieldCheck size={17} /><span>Known reports are matched to provider geometry. The coverage is incomplete; a route is not guaranteed safe.</span></div>
      <small className="provider-note">Routing uses the backend configured OSRM-compatible service. Free demo providers have no uptime guarantee and are not live traffic feeds.</small>
    </aside></div>
  </main>
}

function MyReports() {
  const { token, user, loading: authLoading } = useAuth()
  const [reports, setReports] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!token) return
    let active = true; setLoading(true); setError('')
    getMyReports(token).then(result => { if (active) setReports(result.items) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Personal reports could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, revision])
  const statuses = Array.from(new Set(reports.map(report => report.status))).sort()
  const filtered = reports.filter(report => filter === 'all' || report.status === filter)
  if (authLoading) return <main className="app-page"><LoadingState label="Checking your session" /></main>
  if (!user || !token) return <main className="app-page narrow-page"><PageIntro eyebrow="PERSONAL REPORT HISTORY" title="My reports" description="Report history is linked to the signed-in account that submitted each report." /><div className="auth-prompt cream-panel"><LockKeyhole size={25} /><h2>Sign in to view your reports</h2><p>Reports submitted while signed in are associated with your account. Anonymous reports do not appear in personal history.</p><Link to="/signin" className="button button-forest">Sign in <ArrowRight size={16} /></Link></div></main>
  return <main className="app-page"><PageIntro eyebrow="PERSONAL REPORT HISTORY" title="My reports" description={`Saved submissions for ${user.email}.`} action={<Link to="/report" className="button button-forest"><Plus size={17} /> New report</Link>} />
    <div className="filter-row status-filters"><button type="button" className={`filter-chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All <span>{reports.length}</span></button>{statuses.map(status => <button type="button" key={status} className={`filter-chip${filter === status ? ' active' : ''}`} onClick={() => setFilter(status)}>{status.replaceAll('_', ' ')} <span>{reports.filter(report => report.status === status).length}</span></button>)}<button type="button" className="view-toggle" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /> Refresh</button></div>
    {error && <RetryBanner message={error} onRetry={() => setRevision(value => value + 1)} />}
    {loading ? <LoadingState label="Loading your reports" /> : !filtered.length ? <EmptyState icon={<MapPin />} title={reports.length ? 'No reports match this status' : 'No reports on this account yet'} text={reports.length ? 'Choose another status to see your submissions.' : 'When you submit a report while signed in, it will appear here.'} action={<Link to="/report" className="button button-forest">Submit a report <ArrowRight size={15} /></Link>} /> : <div className="my-report-grid">{filtered.map(report => <ReportCard key={report.id} report={report} />)}</div>}
  </main>
}

function ReportCard({ report }: { report: Hazard }) {
  return <Link to={`/reports/${report.id}`} className="my-report-card"><div className={`report-thumb${report.image_available ? ' has-evidence' : ''}`}>{report.image_available ? <span><Upload size={19} /> Photo stored</span> : <span><MapPin size={19} /> No photo</span>}<span className={`status-tag status-${report.status}`}>{report.status.replaceAll('_', ' ')}</span></div><div className="my-report-copy"><div><span className="eyebrow eyebrow-dark">{CATEGORY_NAMES[report.category] || report.category}</span><h2>{report.id.slice(0, 8)}</h2></div><ArrowRight size={17} /></div><p>{report.description || 'No additional description'}</p><small><MapPin size={13} /> {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)} · {formatDate(report.created_at)}</small></Link>
}

function ReportDetails() {
  const { reportId = '' } = useParams()
  const { token } = useAuth()
  const [report, setReport] = useState<Hazard | null>(null)
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceMessage, setEvidenceMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    apiRequest<Hazard>(`/api/reports/${encodeURIComponent(reportId)}`)
      .then(value => { if (active) setReport(value) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Report details could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reportId])
  useEffect(() => {
    if (!token || !report?.image_available) { setEvidenceUrl(''); setEvidenceMessage(''); return }
    let active = true
    let currentUrl = ''
    setEvidenceUrl(''); setEvidenceMessage('Loading private evidence preview…')
    fetchReportImage(report.id, token).then(url => {
      currentUrl = url
      if (active) { setEvidenceUrl(url); setEvidenceMessage('') }
      else URL.revokeObjectURL(url)
    }).catch(reason => {
      if (active) setEvidenceMessage(reason instanceof Error && 'status' in reason && reason.status === 403
        ? 'Photo evidence is private to the report owner and authorized reviewers.'
        : reason instanceof Error ? reason.message : 'Photo evidence could not be loaded.')
    })
    return () => { active = false; if (currentUrl) URL.revokeObjectURL(currentUrl) }
  }, [report?.id, report?.image_available, token])
  if (loading) return <main className="app-page"><LoadingState label="Loading report details" /></main>
  if (error || !report) return <main className="app-page narrow-page"><PageIntro eyebrow="REPORT DETAILS" title="Report unavailable" description={error || 'No report was returned by the service.'} /><Link to="/reports" className="button button-forest">Back to my reports</Link></main>
  return <main className="app-page report-details-page"><PageIntro eyebrow="SAVED REPORT" title={CATEGORY_NAMES[report.category] || report.category} description={`Report ${report.id} · ${formatDate(report.created_at)}`} action={<Link to="/reports" className="button button-outline"><ArrowRight className="back-arrow" size={16} /> My reports</Link>} /><div className="detail-layout"><section className="cream-panel report-detail-card"><span className={`status-tag status-${report.status}`}>{report.status.replaceAll('_', ' ')}</span><h2>Report information</h2><dl><dt>Report identifier</dt><dd><code>{report.id}</code></dd><dt>Category</dt><dd>{CATEGORY_NAMES[report.category] || report.category}</dd><dt>Severity</dt><dd>{report.severity === 'unrated' ? 'Not assessed' : `${report.severity} · citizen assessment, not verified`}</dd><dt>Coordinates</dt><dd>{report.latitude.toFixed(6)}, {report.longitude.toFixed(6)}</dd><dt>Submitted</dt><dd>{new Date(report.created_at).toLocaleString()}</dd><dt>Photo evidence</dt><dd>{report.image_available ? 'Stored privately with the report' : 'No image attached'}</dd><dt>Description</dt><dd>{report.description || 'No description was provided.'}</dd></dl>{report.image_available && <div className="report-evidence-preview"><h3>Photo evidence</h3>{evidenceUrl ? <img src={evidenceUrl} alt="Private road evidence uploaded with this report" /> : <p role="status">{evidenceMessage || 'Sign in as the report owner or an authorized administrator to view this image.'}</p>}</div>}<a className="text-link" href={googleMapsSearchUrl(`${report.latitude}, ${report.longitude}`)} target="_blank" rel="noopener noreferrer">Open report coordinates in Google Maps <ExternalLink size={14} /></a><p className="small-print">This page shows details returned by the report API. It does not imply an external complaint was filed.</p></section><section className="map-panel"><MapView reports={[report]} center={[report.latitude, report.longitude]} zoom={15} selectedId={report.id} height={420} /></section></div></main>
}

function ProfilePage() {
  const { token, user, loading, signOut } = useAuth()
  const [contributions, setContributions] = useState<{ report_id: string; status: string }[]>([])
  const [error, setError] = useState('')
  const [reduceMotion, setReduceMotion] = useState(() => window.localStorage.getItem('nagardrishti-reduce-motion') === 'true')
  useEffect(() => {
    if (!token) return
    getMyContributions(token).then(result => setContributions(result.items)).catch(reason => setError(reason instanceof Error ? reason.message : 'Contribution history could not be loaded.'))
  }, [token])
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion)
    window.localStorage.setItem('nagardrishti-reduce-motion', String(reduceMotion))
  }, [reduceMotion])
  if (loading) return <main className="app-page"><LoadingState label="Loading profile" /></main>
  return <main className="app-page profile-page"><PageIntro eyebrow="ACCOUNT & PREFERENCES" title="Profile" description="Your profile shows only information returned by the authentication service." />
    {!user ? <div className="auth-prompt cream-panel"><span className="profile-flower"><Flower2 size={28} /></span><h2>Welcome, Explorer</h2><p>Sign in or create an account to view your profile, contributions and personal report history.</p><div className="hero-actions"><Link to="/signin" className="button button-forest"><LogIn size={16} /> Sign in</Link><Link to="/signup" className="button button-outline">Create account</Link></div></div> : <div className="profile-layout"><section className="profile-identity cream-panel"><span className="profile-flower"><Flower2 size={29} /></span><span className="eyebrow eyebrow-dark">SIGNED IN ACCOUNT</span><h2>{user.email}</h2><span className="role-badge">{user.role}</span><div className="profile-divider" /><Link to="/reports" className="profile-link"><span><MapPin size={17} /> My reports</span><ArrowRight size={16} /></Link><div className="profile-link contribution-link"><span><HeartHandshake size={17} /> Dataset contributions <small>{contributions.length} recorded</small></span><ChevronDown size={16} /></div>{error && <div className="inline-error">{error}</div>}{contributions.length > 0 && <ul className="contribution-list">{contributions.map(item => <li key={item.report_id}>Report {item.report_id.slice(0, 8)} <span>{item.status.replaceAll('_', ' ')}</span></li>)}</ul>}<button type="button" className="profile-link signout-link" onClick={signOut}><span><LogOut size={17} /> Sign out</span><ArrowRight size={16} /></button></section>
      <section className="profile-options"><div className="cream-panel settings-panel"><div className="eyebrow eyebrow-dark">SETTINGS</div><h2>Make the app comfortable to use</h2><label className="setting-row"><span><b>Reduce motion</b><small>Turn off interface transitions for this browser.</small></span><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} /></label></div><Link to="/about" className="profile-option"><span><CircleHelp size={18} /><span><b>Help & support</b><small>How the current prototype works</small></span></span><ArrowRight size={16} /></Link><Link to="/privacy" className="profile-option"><span><ShieldCheck size={18} /><span><b>Privacy policy</b><small>Storage, consent and current limitations</small></span></span><ArrowRight size={16} /></Link>{user.role === 'administrator' && <Link to="/admin" className="profile-option"><span><LockKeyhole size={18} /><span><b>Government dashboard</b><small>Authorized dataset review tools</small></span></span><ArrowRight size={16} /></Link>}</section></div>}
  </main>
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true)
    try { if (mode === 'login') await signIn(email, password); else await signUp(email, password); navigate('/profile') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed.') }
    finally { setBusy(false) }
  }
  if (user) return <main className="app-page narrow-page"><div className="auth-prompt cream-panel"><Check size={24} /><h1>You are signed in</h1><p>Account: {user.email} · {user.role}</p><Link to="/profile" className="button button-forest">Open profile <ArrowRight size={16} /></Link></div></main>
  return <main className="app-page auth-page"><section className="auth-card cream-panel"><BrandPetal /><div className="eyebrow eyebrow-dark">NAGARDRISHTI ACCOUNT</div><h1>{mode === 'login' ? 'Welcome back.' : 'Join your road community.'}</h1><p>{mode === 'login' ? 'Sign in to view your saved reports and contributions.' : 'Create a citizen account. The backend assigns the citizen role.'}</p><form onSubmit={submit}><label className="form-label">Email address<input className="field" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label><label className="form-label">Password<input className="field" type="password" minLength={mode === 'register' ? 10 : undefined} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} /></label>{error && <div className="form-alert error-alert" role="alert">{error}</div>}<button className="button button-forest full-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></button></form><p className="auth-switch">{mode === 'login' ? 'New to NagarDrishti?' : 'Already have an account?'} <Link to={mode === 'login' ? '/signup' : '/signin'}>{mode === 'login' ? 'Create an account' : 'Sign in'}</Link></p><small>Account registration never grants administrative access.</small></section></main>
}

function AdminDashboard() {
  const { token, user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<DatasetReviewItem[]>([])
  const [reports, setReports] = useState<Hazard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!token) return
    let active = true; setLoading(true); setError(''); setNotice('')
    getDatasetReview(token).then(async result => {
      const reportData = await fetchReports(token)
      if (active) { setItems(result.items); setReports(reportData.items) }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'The protected review queue is unavailable.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, revision])
  const decide = async (item: DatasetReviewItem, decision: 'approved' | 'rejected') => {
    if (!token) return
    setError(''); setNotice('')
    try {
      const response = await reviewContribution(token, item.contribution_id, decision)
      setNotice(`Contribution ${response.contribution_id} marked ${response.status} by the backend.`)
      setRevision(value => value + 1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The dataset decision was not confirmed.') }
  }
  const reportStatusConfirmed = (id: string, status: ReportStatus, changed: boolean) => {
    setReports(current => current.map(report => report.id === id ? { ...report, status } : report))
    setNotice(changed ? `Report ${id.slice(0, 8)} status was saved by the backend.` : `Report ${id.slice(0, 8)} already had that status.`)
  }
  if (authLoading) return <main className="app-page"><LoadingState label="Checking administrator session" /></main>
  if (!token || !user) return <main className="app-page narrow-page"><PageIntro eyebrow="AUTHORIZED WORKSPACE" title="Government dashboard" description="This dashboard requires a signed-in account with an administrator role." /><div className="auth-prompt cream-panel"><LockKeyhole size={26} /><p>Administrator accounts are assigned outside citizen registration.</p><Link to="/signin" className="button button-forest">Sign in <ArrowRight size={16} /></Link></div></main>
  return <main className="app-page admin-page"><PageIntro eyebrow="RESTRICTED · BACKEND ROLE CHECKED" title="Government dashboard" description={user.role === 'administrator' ? `Authorized session: ${user.email}` : `The backend role is “${user.role}”. Administrative review tools remain protected.`} />
    {error && <RetryBanner message={error} onRetry={() => setRevision(value => value + 1)} />}{notice && <div className="form-alert success-alert" role="status"><Check size={16} />{notice}</div>}
    {user.role === 'administrator' && !error && <><div className="stat-grid"><StatCard icon={<MapPin />} label="Total reports returned" value={loading ? '…' : reports.length} /><StatCard icon={<Activity />} label="Awaiting review" value={loading ? '…' : reports.filter(report => ['submitted', 'under_review'].includes(report.status)).length} /><StatCard icon={<ShieldCheck />} label="Verified reports" value={loading ? '…' : reports.filter(report => report.status === 'verified').length} /><StatCard icon={<Check />} label="Resolved reports" value={loading ? '…' : reports.filter(report => report.status === 'resolved').length} /></div>
      {!loading && <ReportModerationPanel reports={reports} token={token} onConfirmed={reportStatusConfirmed} />}
      <div className="admin-grid"><section className="cream-panel admin-review"><div className="panel-heading"><div><span className="eyebrow eyebrow-dark">PROTECTED ENDPOINT</span><h2>Dataset review queue</h2></div><button type="button" className="icon-button" aria-label="Refresh review queue" onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} /></button></div>{loading ? <LoadingState label="Loading authorized review records" compact /> : !items.length ? <EmptyState icon={<ShieldCheck />} title="No pending contributions" text="Only consented dataset contributions returned by the backend appear here." /> : <div className="review-items">{items.map(item => <article className="review-item" key={item.contribution_id}><span className="eyebrow eyebrow-dark">CONTRIBUTION {item.contribution_id}</span><h3>{CATEGORY_NAMES[item.report.category] || item.report.category}</h3><p>{item.report.description || 'No description was provided.'}</p><small>{item.report.latitude.toFixed(5)}, {item.report.longitude.toFixed(5)} · {formatDate(item.report.created_at)}</small><div><button type="button" className="button button-forest button-small" onClick={() => void decide(item, 'approved')}>Approve contribution</button><button type="button" className="button button-outline button-small" onClick={() => void decide(item, 'rejected')}>Reject</button></div></article>)}</div>}</section><section className="cream-panel category-summary"><span className="eyebrow eyebrow-dark">REPORT CATEGORIES</span><h2>Records returned by API</h2>{categorySummary(reports).map(([category, count]) => <div className="category-bar" key={category}><span>{CATEGORY_NAMES[category] || category}</span><span className="bar-track"><i style={{ width: `${reports.length ? Math.max(3, count / reports.length * 100) : 0}%` }} /></span><b>{count}</b></div>)}<small>Counts are derived from the current reports API. Status changes are recorded in the protected audit log.</small></section></div></>}
  </main>
}

function ReportModerationPanel({ reports, token, onConfirmed }: { reports: Hazard[]; token: string; onConfirmed: (id: string, status: ReportStatus, changed: boolean) => void }) {
  const [page, setPage] = useState(0)
  const [statusById, setStatusById] = useState<Record<string, ReportStatus>>({})
  const [noteById, setNoteById] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [auditReportId, setAuditReportId] = useState('')
  const [events, setEvents] = useState<ReportStatusEvent[]>([])
  const [auditError, setAuditError] = useState('')
  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(reports.length / pageSize))
  const pageItems = reports.slice(page * pageSize, (page + 1) * pageSize)
  const statusOptions: ReportStatus[] = ['submitted', 'under_review', 'verified', 'in_progress', 'resolved', 'rejected']
  const saveStatus = async (report: Hazard) => {
    const status = statusById[report.id] || report.status as ReportStatus
    setError(''); setBusyId(report.id)
    try {
      const result = await updateReportStatus(token, report.id, status, noteById[report.id] || '')
      onConfirmed(report.id, result.status, result.changed)
      setNoteById(current => ({ ...current, [report.id]: '' }))
      if (auditReportId === report.id) {
        const resultEvents = await getReportStatusEvents(token, report.id)
        setEvents(resultEvents.items)
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backend did not confirm this report status change.') }
    finally { setBusyId('') }
  }
  const toggleAudit = async (reportId: string) => {
    setAuditError('')
    if (auditReportId === reportId) { setAuditReportId(''); setEvents([]); return }
    setAuditReportId(reportId); setEvents([])
    try { const result = await getReportStatusEvents(token, reportId); setEvents(result.items) }
    catch (reason) { setAuditError(reason instanceof Error ? reason.message : 'Audit history could not be loaded.') }
  }
  return <section className="cream-panel report-moderation-panel">
    <div className="panel-heading"><div><span className="eyebrow eyebrow-dark">ADMINISTRATOR ONLY · AUDIT LOGGED</span><h2>Report moderation and status</h2></div><span className="data-badge">{reports.length} API records</span></div>
    <p className="moderation-disclaimer">Updates require the backend administrator role. Each successful change records the previous status, new status, administrator ID, time, and optional note.</p>
    {error && <div className="form-alert error-alert" role="alert">{error}</div>}
    {!reports.length ? <EmptyState icon={<FileText />} title="No reports to moderate" text="Report records returned by the backend will appear here." /> : <div className="moderation-list">{pageItems.map(report => <article className="moderation-item" key={report.id}>
      <div className="moderation-report-summary"><span className="eyebrow eyebrow-dark">{report.id.slice(0, 12)}</span><b>{CATEGORY_NAMES[report.category] || report.category}</b><small>{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)} · {formatDate(report.created_at)} · {report.severity} self-assessed</small><Link to={`/reports/${report.id}`}>View report details <ArrowRight size={13} /></Link></div>
      <div className="moderation-controls"><label>Status<select className="field" aria-label={`New status for report ${report.id}`} value={statusById[report.id] || report.status} onChange={event => setStatusById(current => ({ ...current, [report.id]: event.target.value as ReportStatus }))}>{statusOptions.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label><label>Audit note <span className="optional">Optional</span><input className="field" maxLength={1000} value={noteById[report.id] || ''} onChange={event => setNoteById(current => ({ ...current, [report.id]: event.target.value }))} placeholder="Reason for this status change" /></label><div><button className="button button-forest button-small" type="button" onClick={() => void saveStatus(report)} disabled={busyId === report.id}>{busyId === report.id ? 'Saving…' : 'Save status'}</button><button className="button button-outline button-small" type="button" onClick={() => void toggleAudit(report.id)}>{auditReportId === report.id ? 'Hide audit' : 'View audit'}</button></div></div>
      {auditReportId === report.id && <div className="audit-history"><b>Recorded status changes</b>{auditError ? <p role="alert">{auditError}</p> : !events.length ? <p>No status changes have been recorded.</p> : events.map((event, index) => <p key={`${event.changed_at}-${index}`}><strong>{event.old_status.replaceAll('_', ' ')} → {event.new_status.replaceAll('_', ' ')}</strong><span>{formatDate(event.changed_at)} · admin ID {event.changed_by}{event.note ? ` · ${event.note}` : ''}</span></p>)}</div>}
    </article>)}</div>}
    {reports.length > pageSize && <div className="moderation-pagination"><button className="button button-outline button-small" type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>Previous</button><span>Page {page + 1} of {pageCount}</span><button className="button button-outline button-small" type="button" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>Next</button></div>}
  </section>
}

function categorySummary(reports: Hazard[]): [string, number][] {
  const counts = new globalThis.Map<string, number>()
  for (const report of reports) counts.set(report.category, (counts.get(report.category) || 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return <article className="stat-card"><span className="stat-icon">{icon}</span><span className="stat-value">{value}</span><span className="stat-label">{label}</span></article>
}

function InfoPage({ kind }: { kind: 'process' | 'about' | 'privacy' }) {
  const pages = {
    process: { eyebrow: 'A TRANSPARENT PROCESS', title: 'From observation to insight', text: 'A road report is a community observation. It becomes useful when evidence, location and consent are handled carefully.', cards: [['01', 'Capture', 'Choose a road photo and confirm its location.'], ['02', 'Review', 'Submitted reports are saved by the backend; review status remains visible.'], ['03', 'Share', 'External authority complaint submission is not connected.'], ['04', 'Contribute', 'Dataset contributions require explicit consent and backend review.']] },
    about: { eyebrow: 'ABOUT NAGARDRISHTI AI', title: 'A clearer picture of our roads', text: 'A civic technology prototype for reporting road hazards, exploring submitted observations and planning routes around known records.', cards: [['01', 'Community first', 'Reports and map markers come from the application database.'], ['02', 'Evidence over claims', 'The configured AI model reports unavailable and returns no predictions.'], ['03', 'Privacy by choice', 'Reporting and dataset consent are separate backend records.'], ['04', 'Honest status', 'There is no live traffic feed or government complaint integration.']] },
    privacy: { eyebrow: 'PRIVACY & DATA', title: 'Your report. Your choice.', text: 'Reports store an image and coordinates in the local application backend. Optional dataset consent is recorded separately.', cards: [['01', 'Location', 'Coordinates are attached to the report and shown on the report map.'], ['02', 'Image', 'Uploaded image bytes are stored on the backend filesystem.'], ['03', 'Dataset consent', 'Only an explicit yes creates a pending dataset review contribution.'], ['04', 'Limitations', 'Retention controls, image redaction and deletion workflows are not implemented.']] },
  } as const
  const data = pages[kind]
  return <main className="app-page info-page"><PageIntro eyebrow={data.eyebrow} title={data.title} description={data.text} /><div className="info-grid">{data.cards.map(([number, title, text]) => <article className="info-card" key={number}><span>{number}</span><h2>{title}</h2><p>{text}</p></article>)}</div><Link to="/report" className="button button-forest">Report a hazard <ArrowRight size={16} /></Link></main>
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow eyebrow-dark">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`loading-state${compact ? ' compact' : ''}`} role="status"><span className="spinner" /><span>{label}</span></div>
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><b>{title}</b><span>{text}</span>{action}</div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function NotFound() {
  return <main className="app-page narrow-page"><div className="empty-state not-found"><span className="eyebrow eyebrow-dark">404 · NOT FOUND</span><h1>This page is not on the map.</h1><p>The address does not match an available application route.</p><Link to="/" className="button button-forest">Return home <ArrowRight size={16} /></Link></div></main>
}

export default App
