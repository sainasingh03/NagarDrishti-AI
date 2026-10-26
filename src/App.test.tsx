import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear() })

function response(payload: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(payload) }
}

describe('NagarDrishti public experience', () => {
  it('renders the editorial landing page with working app calls to action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], count: 0 })))
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /safer roads/i })).toBeTruthy()
    expect(screen.getByText(/See the Danger\. Find the Safer Route\./)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /report a hazard/i }).length).toBeGreaterThan(0)
    expect(await screen.findByText(/reports returned by the API/i)).toBeTruthy()
  })

  it('shows a not-found page for unmatched routes', () => {
    render(<MemoryRouter initialEntries={['/missing-route']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /this page is not on the map/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /return home/i }).getAttribute('href')).toBe('/')
  })

  it('shows the real unavailable model response without fabricated predictions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      model_available: false, model_version: null, supported_classes: [],
      reason: 'No compatible inference adapter and model weights are configured.', configured_weights: false,
    })))
    render(<MemoryRouter initialEntries={['/detection']}><App /></MemoryRouter>)
    expect(await screen.findByText(/Model unavailable/i)).toBeTruthy()
    expect(screen.getByText(/No prediction or confidence value has been fabricated/i)).toBeTruthy()
    expect((screen.getByRole('button', { name: /continue to human report/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('routes an unauthenticated citizen to real sign-in before showing personal reports', () => {
    render(<MemoryRouter initialEntries={['/reports']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /sign in to view your reports/i })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /sign in/i }).some(link => link.getAttribute('href') === '/signin')).toBe(true)
  })

  it('keeps route location forms separate from the route action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], count: 0 })))
    const { container } = render(<MemoryRouter initialEntries={['/navigation']}><App /></MemoryRouter>)
    expect(await screen.findByRole('textbox', { name: 'Origin' })).toBeTruthy()
    expect(container.querySelectorAll('form form')).toHaveLength(0)
  })

  it('exposes every civic navigation destination as a real application route', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], count: 0 })))
    render(<MemoryRouter><App /></MemoryRouter>)
    for (const [label, path] of [
      ['Home', '/'], ['Explore map', '/explore'], ['Smart routes', '/navigation'],
      ['AI detection', '/detection'], ['My reports', '/reports'],
      ['Community updates', '/community'], ['State-level complaints', '/complaints'],
      ['Government portal', '/government'], ['State monitoring', '/state-monitoring'],
      ['Admin dashboard', '/admin'],
    ]) {
      expect(screen.getAllByRole('link', { name: new RegExp(label, 'i'), hidden: true }).some(link => link.getAttribute('href') === path)).toBe(true)
    }
  })

  it('prepares an explicitly local complaint draft without sending a government request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [{
      id: 'report-12345678', category: 'pothole', description: 'Large pothole near junction',
      latitude: 12.9716, longitude: 77.5946, status: 'submitted', is_demo: false,
      created_at: '2026-10-12T12:00:00Z', image_available: true,
    }], count: 1, demo_data: false }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MemoryRouter initialEntries={['/complaints']}><App /></MemoryRouter>)
    const reportSelect = await screen.findByLabelText(/application report reference/i)
    fireEvent.change(reportSelect, { target: { value: 'report-12345678' } })
    fireEvent.click(screen.getByRole('button', { name: /prepare local draft/i }))
    expect(await screen.findByText(/not submitted to a government department/i)).toBeTruthy()
    expect(screen.getByText(/Large pothole near junction/)).toBeTruthy()
    expect(screen.getByText(/Not sent · not acknowledged · not an official complaint number/i)).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url, options]) => String(url).includes('/api/') && (options as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })

  it('filters community updates using categories from the real report response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [
      { id: 'pothole-1', category: 'pothole', description: 'Road surface damage', latitude: 12.9, longitude: 77.5, status: 'submitted', is_demo: false, created_at: '2026-10-12T12:00:00Z', image_available: false },
      { id: 'crack-1', category: 'road_crack', description: 'Long crack by junction', latitude: 12.8, longitude: 77.4, status: 'verified', is_demo: false, created_at: '2026-10-11T12:00:00Z', image_available: false },
    ], count: 2, demo_data: false })))
    render(<MemoryRouter initialEntries={['/community']}><App /></MemoryRouter>)
    expect(await screen.findByText('2 of 2 returned records')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/filter by category/i), { target: { value: 'pothole' } })
    expect(await screen.findByText('1 of 2 returned records')).toBeTruthy()
    expect(screen.getByText('Road surface damage')).toBeTruthy()
    expect(screen.queryByText('Long crack by junction')).toBeNull()
  })
})
