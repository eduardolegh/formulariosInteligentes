import { useRef, useState } from 'react'
import type { PendingAttachment } from '../types/attachments'

type Props = { attachment?: PendingAttachment; onChange: (attachment: PendingAttachment | null) => void }

export function DocumentAttachmentField({ attachment, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState('')
  async function select(file?: File) {
    setError('')
    if (!file) return
    const header = await file.slice(0, 5).text()
    if ((file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf') || header !== '%PDF-') { setError('Selecciona un archivo PDF válido.'); onChange(null); return }
    if (file.size > 10 * 1024 * 1024) { setError('El documento no puede superar los 10 MB.'); onChange(null); return }
    onChange({ blob: file, originalName: file.name, mimeType: 'application/pdf', kind: 'document', source: 'file_upload', validationStatus: 'not_required' })
  }
  return <div className={`document-attachment-field ${attachment ? 'selected' : ''}`}>
    <input ref={inputRef} accept="application/pdf,.pdf" hidden onChange={(event) => void select(event.target.files?.[0])} type="file" />
    <div className="document-upload-icon" aria-hidden="true">PDF</div>
    <div className="document-upload-copy"><strong>{attachment ? attachment.originalName : 'Selecciona un documento PDF'}</strong><span>{attachment ? `${(attachment.blob.size / 1024 / 1024).toFixed(2)} MB · Listo para enviar` : 'Tamaño máximo: 10 MB'}</span>{error && <small role="alert">{error}</small>}</div>
    <button className="secondary-button" onClick={() => inputRef.current?.click()} type="button">{attachment ? 'Cambiar' : 'Seleccionar archivo'}</button>
    {attachment && <button aria-label="Quitar archivo" className="document-remove" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }} type="button">×</button>}
  </div>
}
