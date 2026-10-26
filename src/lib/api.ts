export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
export const GEOCODER_BASE = (import.meta.env.VITE_GEOCODER_URL || 'https://nominatim.openstreetmap.org/search').replace(/\/$/, '')

export type Hazard = {
  id: string
  category: string
  description: string
  latitude: number
  longitude: number
  status: string
  is_demo: boolean
  created_at: string
  image_available: boolean
}

export type RouteOption = {
  id: string
  distance_m: number
  duration_s: number
  hazard_count: number
  verified_hazard_count: number
  hazard_score: number
  recommended?: boolean
  geometry: { coordinates: [number, number][]; type?: string }
  limited_coverage?: boolean
}

export type ModelStatus = {
  model_available: boolean
  model_version: string | null
  supported_classes: string[]
  reason: string
  configured_weights?: boolean
}

export type UserProfile = { email: string; role: string }
export type DatasetReviewItem = { contribution_id: number; report: Hazard }
export type Place = { place_id: number; display_name: string; lat: string; lon: string }
let lastGeocodeRequest = 0

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }
  if (!response.ok) {
    const detail = typeof data === 'object' && data !== null && 'detail' in data
      ? String((data as { detail: unknown }).detail)
      : `Request failed (${response.status})`
    throw new ApiError(detail, response.status)
  }
  return data as T
}

export function fetchHazards(category = '') {
  const query = category ? `?category=${encodeURIComponent(category)}` : ''
  return apiRequest<{ items: Hazard[]; count: number; coverage_limited?: boolean }>(`/api/hazards${query}`)
}

export function fetchReports(token?: string | null) {
  return apiRequest<{ items: Hazard[]; count: number; demo_data?: boolean }>('/api/reports?limit=200', {}, token)
}

export function submitReport(form: FormData, token?: string | null) {
  return apiRequest<Hazard>('/api/reports', { method: 'POST', body: form }, token)
}

export function fetchModelStatus() {
  return apiRequest<ModelStatus>('/api/models/status')
}

export function fetchRoutes(from: [number, number], to: [number, number]) {
  const query = new URLSearchParams({
    origin_lat: String(from[0]), origin_lon: String(from[1]),
    destination_lat: String(to[0]), destination_lon: String(to[1]),
  })
  return apiRequest<{ routes: RouteOption[]; provider: string; hazard_coverage_limited: boolean; explanation: string }>(`/api/navigation/routes?${query}`)
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const normalized = query.trim()
  if (!normalized) return []
  const cacheKey = `nagardrishti-geocode:${normalized.toLocaleLowerCase()}`
  try {
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) return JSON.parse(cached) as Place[]
  } catch { /* Storage can be disabled; the live request still works. */ }
  const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeRequest))
  if (wait) await new Promise(resolve => window.setTimeout(resolve, wait))
  lastGeocodeRequest = Date.now()
  const url = new URL(GEOCODER_BASE)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')
  url.searchParams.set('q', normalized)
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Place search failed (${response.status})`, response.status)
  const results = await response.json() as Place[]
  try { sessionStorage.setItem(cacheKey, JSON.stringify(results)) } catch { /* Cache is optional. */ }
  return results
}

export function authenticate(email: string, password: string, mode: 'login' | 'register') {
  return apiRequest<{ access_token: string; token_type: string; user: UserProfile }>(`/api/auth/${mode}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
}

export function getProfile(token: string) {
  return apiRequest<UserProfile>('/api/auth/me', {}, token)
}

export function getMyReports(token: string) {
  return apiRequest<{ items: Hazard[]; count: number }>('/api/reports/mine', {}, token)
}

export function getMyContributions(token: string) {
  return apiRequest<{ items: { report_id: string; status: string }[] }>('/api/dataset/contributions/mine', {}, token)
}

export function getDatasetReview(token: string) {
  return apiRequest<{ items: DatasetReviewItem[] }>('/api/admin/dataset/review', {}, token)
}

export function reviewContribution(token: string, id: number, decision: 'approved' | 'rejected') {
  const form = new FormData()
  form.append('decision', decision)
  return apiRequest<{ status: string; contribution_id: number }>(`/api/admin/dataset/${id}/review`, { method: 'POST', body: form }, token)
}
