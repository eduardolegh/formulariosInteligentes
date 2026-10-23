import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { latLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type SubmissionMapPoint = {
  id: string
  latitude: number
  longitude: number
  accuracy: number | null
  submittedAt: string
  formName: string
  status: string
}

const guatemalaCenter: [number, number] = [15.6, -90.25]
const tileUrl = import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tileAttribution = import.meta.env.VITE_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function SubmissionMap({ points }: { points: SubmissionMapPoint[] }) {
  return <div className="submission-map-wrap">
    <MapContainer className="submission-map" center={guatemalaCenter} zoom={7} scrollWheelZoom>
      <TileLayer
        attribution={tileAttribution}
        url={tileUrl}
      />
      <FitSubmissionBounds points={points} />
      {points.map((point) => <CircleMarker center={[point.latitude, point.longitude]} fillColor="#247f95" fillOpacity={.72} key={point.id} pathOptions={{ color: '#fff', weight: 2 }} radius={8}>
        <Popup><div className="submission-map-popup"><strong>{point.formName}</strong><span>{new Date(point.submittedAt).toLocaleString('es-GT')}</span><span>Estado: {statusLabel(point.status)}</span>{point.accuracy != null && <small>Precisión aproximada: {Math.round(point.accuracy)} m</small>}</div></Popup>
      </CircleMarker>)}
    </MapContainer>
  </div>
}

function FitSubmissionBounds({ points }: { points: SubmissionMapPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) { map.setView(guatemalaCenter, 7); return }
    if (points.length === 1) { map.setView([points[0].latitude, points[0].longitude], 13); return }
    map.fitBounds(latLngBounds(points.map((point) => [point.latitude, point.longitude])), { padding: [35, 35], maxZoom: 14 })
  }, [map, points])
  return null
}

function statusLabel(status: string) {
  return ({ submitted: 'Ingresado', in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', completed: 'Completado' } as Record<string, string>)[status] ?? status
}
