export type IdentityDocumentValue = {
  document_type: string
  document_number: string
  first_names: string
  last_names: string
  capture_method: 'manual' | 'camera'
  validation?: {
    status: 'valid_document' | 'not_document' | 'unreadable'
    confidence: number
    reason: string
    document_side: 'front' | 'back' | 'unknown'
    has_portrait: boolean
    all_required_fields_visible: boolean
  }
  attachment_id?: string
}

export type PendingAttachment = {
  blob: Blob
  originalName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  kind: 'identity_document' | 'document' | 'photo'
  source: 'camera' | 'file_upload'
  validationStatus: 'valid' | 'pending' | 'invalid' | 'not_required'
  validationResult?: Record<string, unknown>
}
