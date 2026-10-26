import { useEffect, useState } from 'react'
import L, { type LatLngTuple } from 'leaflet'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Hazard, RouteOption } from '../lib/api'

const INDIA_CENTER: LatLngTuple = [22.9, 78.3]
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const mapAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const categoryNames: Record<string, string> = {
  pothole: 'Pothole', road_crack: 'Road crack', damaged_surface: 'Damaged surface', waterlogging: 'Waterlogging', other: 'Other hazard',
}

function markerIcon(category: string, selected: boolean) {
  const name = categoryNames[category] ? category.replaceAll('_', '-') : 'other'
  return L.divIcon({
    className: 'hazard-icon-wrap',
    html: `<span class="hazard-pin hazard-${name}${selected ? ' is-selected' : ''}" aria-hidden="true"></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 31],
    popupAnchor: [0, -29],
  })
}

function MapController({ center, zoom, reports, routes, selectedRouteId }: {
  center?: LatLngTuple | null; zoom: number; reports: Hazard[]; routes: RouteOption[]; selectedRouteId?: string | null
}) {
  const map = useMap()
  useEffect(() => {
    const selectedRoute = routes.find(route => route.id === selectedRouteId)
    const coords = selectedRoute?.geometry?.coordinates
    if (coords?.length) {
      const bounds = L.latLngBounds(coords.map(([lon, lat]) => [lat, lon] as LatLngTuple))
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14 })
    } else if (center) {
      map.setView(center, zoom, { animate: true })
    } else if (reports.length) {
      const bounds = L.latLngBounds(reports.map(report => [report.latitude, report.longitude] as LatLngTuple))
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [42, 42], maxZoom: 13 })
    }
  }, [center?.[0], center?.[1], zoom, reports, routes, selectedRouteId, map])
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 100)
    return () => window.clearTimeout(timer)
  }, [map])
  return null
}

function MapPicker({ onPick }: { onPick?: (point: [number, number]) => void }) {
  useMapEvents({ click(event) { onPick?.([event.latlng.lat, event.latlng.lng]) } })
  return null
}

export type MapViewProps = {
  reports?: Hazard[]
  center?: LatLngTuple | null
  zoom?: number
  selectedId?: string | null
  onSelect?: (hazard: Hazard) => void
  routes?: RouteOption[]
  selectedRouteId?: string | null
  onRouteSelect?: (id: string) => void
  origin?: LatLngTuple | null
  destination?: LatLngTuple | null
  onPick?: (point: [number, number]) => void
  className?: string
  height?: number | string
}

export default function MapView({
  reports = [], center = null, zoom = 5, selectedId, onSelect, routes = [], selectedRouteId,
  onRouteSelect, origin, destination, onPick, className = '', height = 480,
}: MapViewProps) {
  const [tileError, setTileError] = useState(false)
  return <div className={`map-view ${className}`} style={{ height }}>
    <MapContainer center={INDIA_CENTER} zoom={5} scrollWheelZoom zoomControl>
      <TileLayer url={TILE_URL} attribution={mapAttribution} eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }} />
      <MapController center={center} zoom={zoom} reports={reports} routes={routes} selectedRouteId={selectedRouteId} />
      <MapPicker onPick={onPick} />
      {reports.map(report => <Marker
        key={report.id}
        position={[report.latitude, report.longitude]}
        icon={markerIcon(report.category, selectedId === report.id)}
        eventHandlers={{ click: () => onSelect?.(report) }}
      >
        <Popup>
          <div className="map-popup">
            <strong>{categoryNames[report.category] || report.category}</strong>
            <span className={`status-tag status-${report.status.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{report.status.replaceAll('_', ' ')}</span>
            {report.description && <p>{report.description}</p>}
            <small>{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)} · {new Date(report.created_at).toLocaleDateString()}</small>
            {report.is_demo && <small className="demo-label">Demonstration record</small>}
          </div>
        </Popup>
      </Marker>)}
      {routes.map(route => {
        const coordinates = route.geometry?.coordinates
        if (!coordinates?.length) return null
        const positions = coordinates.map(([lon, lat]) => [lat, lon] as LatLngTuple)
        const selected = selectedRouteId === route.id
        return <Polyline
          key={route.id}
          positions={positions}
          pathOptions={{ color: selected ? '#d5b77a' : '#507967', weight: selected ? 7 : 4, opacity: selected ? 0.96 : 0.55, lineCap: 'round', lineJoin: 'round' }}
          eventHandlers={{ click: () => onRouteSelect?.(route.id) }}
        />
      })}
      {origin && <CircleMarker center={origin} radius={8} pathOptions={{ color: '#f6f0e3', fillColor: '#315747', fillOpacity: 1, weight: 3 }}><Popup>Route origin</Popup></CircleMarker>}
      {destination && <CircleMarker center={destination} radius={8} pathOptions={{ color: '#f6f0e3', fillColor: '#d9554d', fillOpacity: 1, weight: 3 }}><Popup>Route destination</Popup></CircleMarker>}
    </MapContainer>
    {onPick && <span className="map-pick-hint">Click the map to set a location</span>}
    {tileError && <div className="map-tile-alert" role="status">Map tiles are unavailable. Try again later or configure another tile provider.</div>}
  </div>
}

export { INDIA_CENTER }
