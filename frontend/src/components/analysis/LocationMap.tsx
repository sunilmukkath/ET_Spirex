import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPoint {
  lat: number
  lng: number
}

interface Props {
  points: MapPoint[]
  bounds?: {
    north: number
    south: number
    east: number
    west: number
  } | null
}

export function LocationMap({ points, bounds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return

    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, { scrollWheelZoom: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const latLngs: L.LatLngExpression[] = []
    for (const p of points) {
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: '#0b2545',
        fillColor: '#0f766e',
        fillOpacity: 0.75,
        weight: 1,
      }).addTo(map)
      latLngs.push([p.lat, p.lng])
    }

    if (bounds) {
      map.fitBounds(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        { padding: [24, 24] },
      )
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 12)
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] })
    }

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [points, bounds])

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        No valid GPS coordinates in responses
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-96 w-full overflow-hidden rounded-xl border border-slate-200 shadow-inner"
    />
  )
}
