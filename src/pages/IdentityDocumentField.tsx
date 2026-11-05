import { useEffect, useRef, useState } from 'react'
import { invokeAi } from '../lib/ai'
import type { IdentityDocumentValue, PendingAttachment } from '../types/attachments'

type ValidationResponse = {
  valid_document: boolean
  status: 'valid_document' | 'not_document' | 'unreadable'
  document_side: 'front' | 'back' | 'unknown'
  has_portrait: boolean
  document_type: string
  document_number: string
  first_names: string
  last_names: string
  visible_fields: { document_type: boolean; document_number: boolean; first_names: boolean; last_names: boolean }
  confidence: number
  reason: string
}

type Props = {
  fieldId: string
  shareToken: string
  requestPhoto: boolean
  value?: IdentityDocumentValue
  onChange: (value: IdentityDocumentValue) => void
  onAttachmentChange: (attachment: PendingAttachment | null) => void
}

const emptyValue = (captureMethod: 'manual' | 'camera'): IdentityDocumentValue => ({
  document_type: '', document_number: '', first_names: '', last_names: '', capture_method: captureMethod,
})

async function imageFromVideo(video: HTMLVideoElement) {
  const maxWidth = 1600
  const scale = Math.min(1, maxWidth / video.videoWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
  if (!blob) throw new Error('No fue posible preparar la fotografía.')
  return { blob, dataUrl: canvas.toDataURL('image/jpeg', 0.82) }
}

export function IdentityDocumentField({ fieldId, shareToken, requestPhoto, value, onChange, onAttachmentChange }: Props) {
  const current = value ?? emptyValue(requestPhoto ? 'camera' : 'manual')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [preview, setPreview] = useState('')
  const [state, setState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle')
  const [message, setMessage] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOpen(false)
  }
  useEffect(() => stopCamera, [])

  const setPart = (key: keyof Pick<IdentityDocumentValue, 'document_type' | 'document_number' | 'first_names' | 'last_names'>, part: string) => {
    onChange({ ...current, [key]: part, capture_method: requestPhoto ? 'camera' : 'manual' })
  }
  async function startCamera() {
    setMessage('')
    if (!navigator.mediaDevices?.getUserMedia) { setState('invalid'); setMessage('Este dispositivo no permite utilizar la cámara.'); return }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      setCameraOpen(true)
      requestAnimationFrame(() => { if (videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; void videoRef.current.play() } })
    } catch { setState('invalid'); setMessage('No se pudo abrir la cámara. Revisa el permiso del navegador e inténtalo nuevamente.') }
  }
  async function capture() {
    if (!videoRef.current) return
    setState('validating'); setMessage('Comprobando el documento y leyendo la información…')
    try {
      const image = await imageFromVideo(videoRef.current)
      stopCamera(); setPreview(image.dataUrl)
      const result = await invokeAi<ValidationResponse>('validate-identity-document', {
        share_token: shareToken, field_id: fieldId, image_base64: image.dataUrl.split(',')[1], mime_type: 'image/jpeg',
      })
      const complete = [result.document_type, result.document_number, result.first_names, result.last_names].every((part) => String(part ?? '').trim())
      const allRequiredFieldsVisible = Object.values(result.visible_fields ?? {}).length === 4 && Object.values(result.visible_fields).every(Boolean)
      const dpiNumberValid = !result.document_type.toUpperCase().includes('DPI') || result.document_number.replace(/\D/g, '').length === 13
      const acceptedFront = result.valid_document && result.status === 'valid_document' && result.document_side === 'front' && result.has_portrait && allRequiredFieldsVisible && result.confidence >= 0.85 && complete && dpiNumberValid
      if (!acceptedFront) {
        setState('invalid'); setPreview(''); onAttachmentChange(null)
        onChange(emptyValue('camera'))
        setMessage(result.document_side === 'back' ? 'Se capturó el reverso del documento. Fotografía el frente, donde aparecen el retrato y los datos personales.' : result.reason || 'La fotografía no corresponde al frente de un documento de identidad legible. Intenta nuevamente.')
        return
      }
      const validation = { status: result.status, confidence: result.confidence, reason: result.reason, document_side: result.document_side, has_portrait: result.has_portrait, all_required_fields_visible: allRequiredFieldsVisible }
      onChange({ document_type: result.document_type, document_number: result.document_number, first_names: result.first_names, last_names: result.last_names, capture_method: 'camera', validation })
      onAttachmentChange({ blob: image.blob, originalName: 'documento-identidad.jpg', mimeType: 'image/jpeg', kind: 'identity_document', source: 'camera', validationStatus: 'valid', validationResult: result as unknown as Record<string, unknown> })
      setState('valid'); setMessage('Documento validado. Los datos fueron completados automáticamente.')
    } catch (error) {
      setState('invalid'); setPreview(''); onAttachmentChange(null)
      setMessage(error instanceof Error ? error.message : 'No fue posible validar el documento.')
    }
  }

  return <div className={`identity-document-field ${requestPhoto ? 'photo-mode' : 'manual-mode'}`}>
    {requestPhoto && <div className="identity-capture-card">
      <div><span className="identity-capture-icon" aria-hidden="true">▣</span><div><strong>Fotografía del documento</strong><p>Coloca el documento completo dentro de la cámara, con buena iluminación y sin reflejos.</p></div></div>
      {!cameraOpen && <button className="secondary-button" disabled={state === 'validating'} onClick={() => void startCamera()} type="button">{preview ? 'Capturar nuevamente' : 'Abrir cámara'}</button>}
      {cameraOpen && <div className="identity-camera"><video ref={videoRef} autoPlay muted playsInline /><div><button className="text-button" onClick={stopCamera} type="button">Cancelar</button><button className="primary-button" onClick={() => void capture()} type="button">Capturar documento</button></div></div>}
      {preview && !cameraOpen && <img className="identity-document-preview" src={preview} alt="Documento de identidad capturado" />}
      {message && <div className={`identity-validation-message ${state}`} role="status"><span>{state === 'valid' ? '✓' : state === 'validating' ? '✦' : '!'}</span><p>{message}</p></div>}
    </div>}
    <div className="identity-data-grid">
      <label><span>Tipo de documento</span><select disabled={requestPhoto} value={current.document_type} onChange={(event) => setPart('document_type', event.target.value)}><option value="">Selecciona</option><option>DPI</option><option>Pasaporte</option><option>Licencia de conducir</option><option>Otro</option>{requestPhoto && current.document_type && !['DPI', 'Pasaporte', 'Licencia de conducir', 'Otro'].includes(current.document_type) && <option>{current.document_type}</option>}</select></label>
      <label><span>Número de documento</span><input readOnly={requestPhoto} value={current.document_number} onChange={(event) => setPart('document_number', event.target.value)} /></label>
      <label><span>Nombres</span><input readOnly={requestPhoto} value={current.first_names} onChange={(event) => setPart('first_names', event.target.value)} /></label>
      <label><span>Apellidos</span><input readOnly={requestPhoto} value={current.last_names} onChange={(event) => setPart('last_names', event.target.value)} /></label>
    </div>
    {requestPhoto && state !== 'valid' && <small className="identity-readonly-hint">Los campos se completarán cuando la fotografía sea validada.</small>}
  </div>
}
