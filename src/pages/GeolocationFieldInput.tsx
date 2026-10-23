import { useState } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'

type Coordinates = { latitude: number; longitude: number }

const defaultCenter: [number, number] = [15.6, -90.25]
const tileUrl = import.meta.env.VITE_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const tileAttribution = import.meta.env.VITE_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const locationMarkerIcon = divIcon({
  className: 'geolocation-map-marker',
  html: '<span aria-hidden="true"><i></i></span>',
  iconAnchor: [20, 46],
  iconSize: [40, 48],
})

export function GeolocationFieldInput({ value, required, onChange }: { value: string; required: boolean; onChange: (value: string) => void }) {
  const current = parseCoordinates(value)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState<Coordinates | null>(current)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')

  function captureCurrentLocation() {
    setError('')
    if (!navigator.geolocation) { setError('Este dispositivo no permite obtener la ubicación.'); return }
    setCapturing(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(formatCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }))
        setDraft({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setCapturing(false)
      },
      (locationError) => {
        setError(locationError.code === locationError.PERMISSION_DENIED ? 'No se concedió el permiso de ubicación.' : 'No fue posible obtener tu ubicación.')
        setCapturing(false)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  function openPicker() { setDraft(current); setError(''); setPickerOpen(true) }
  function confirmPicker() { if (!draft) return; onChange(formatCoordinates(draft)); setPickerOpen(false) }

  return <div className="geolocation-field-input">
    <div className="geolocation-field-actions">
      <button className="secondary-button" disabled={capturing} onClick={captureCurrentLocation} type="button">{capturing ? 'Capturando…' : '⌖ Capturar mi ubicación'}</button>
      <button className="secondary-button" onClick={openPicker} type="button">Seleccionar en el mapa</button>
    </div>
    <input aria-label="Coordenadas seleccionadas" className="geolocation-coordinate-value" placeholder="Aún no se ha seleccionado una ubicación" readOnly required={required} value={value} />
    {current && <div className="geolocation-selected"><span>✓</span><div><strong>Ubicación seleccionada</strong><small>Latitud {current.latitude.toFixed(6)} · Longitud {current.longitude.toFixed(6)}</small></div><button className="text-button" onClick={() => { onChange(''); setDraft(null) }} type="button">Quitar</button></div>}
    {error && <small className="geolocation-field-error">{error}</small>}
    {pickerOpen && <div className="modal-backdrop geolocation-picker-backdrop"><section aria-modal="true" className="geolocation-picker-modal" role="dialog"><header><div><span className="eyebrow">SELECCIONAR UBICACIÓN</span><h2>Marca un punto en el mapa</h2><p>Toca o haz clic sobre el mapa para mover el punto.</p></div><button aria-label="Cerrar" onClick={() => setPickerOpen(false)} type="button">×</button></header><div className="geolocation-picker-map"><MapContainer center={draft ? [draft.latitude, draft.longitude] : defaultCenter} zoom={draft ? 14 : 7} scrollWheelZoom><TileLayer attribution={tileAttribution} url={tileUrl} /><MapPointSelector position={draft} onSelect={setDraft} /></MapContainer></div><footer><div>{draft ? <><strong>{draft.latitude.toFixed(6)}</strong><span>{draft.longitude.toFixed(6)}</span></> : <span>Selecciona un punto para continuar.</span>}</div><button className="text-button" onClick={() => setPickerOpen(false)} type="button">Cancelar</button><button className="primary-button" disabled={!draft} onClick={confirmPicker} type="button">Usar esta ubicación</button></footer></section></div>}
  </div>
}

function MapPointSelector({ position, onSelect }: { position: Coordinates | null; onSelect: (position: Coordinates) => void }) {
  useMapEvents({ click: (event) => onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
  return position ? <Marker icon={locationMarkerIcon} position={[position.latitude, position.longitude]} /> : null
}

function parseCoordinates(value: string): Coordinates | null {
  const [latitudeValue, longitudeValue] = value.split('|')
  const latitude = Number(latitudeValue); const longitude = Number(longitudeValue)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 ? { latitude, longitude } : null
}
function formatCoordinates(position: Coordinates) { return `${position.latitude.toFixed(6)}|${position.longitude.toFixed(6)}` }
