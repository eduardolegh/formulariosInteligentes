export function validateExternalUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('La integración debe utilizar HTTPS.')
  }
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') {
    if (Deno.env.get('ALLOW_LOCAL_INTEGRATION_URLS') !== 'true') throw new Error('Las direcciones locales no están permitidas.')
  }
  if (/^(10\.|192\.168\.|169\.254\.|0\.|127\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error('Las direcciones de red privada no están permitidas.')
  }
  return url.toString()
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)) }
async function encryptionKey() {
  const secret = Deno.env.get('INTEGRATIONS_ENCRYPTION_KEY')
  if (!secret || secret.length < 24) throw new Error('INTEGRATIONS_ENCRYPTION_KEY no está configurada o es demasiado corta.')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); const key = await encryptionKey()
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret)))
  return `${bytesToBase64(iv)}.${bytesToBase64(encrypted)}`
}
export async function decryptSecret(value: string) {
  const [ivValue, encryptedValue] = value.split('.'); if (!ivValue || !encryptedValue) throw new Error('La credencial almacenada no es válida.')
  const key = await encryptionKey(); const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivValue) }, key, base64ToBytes(encryptedValue))
  return new TextDecoder().decode(decrypted)
}
