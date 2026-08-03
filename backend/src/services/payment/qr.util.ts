import QRCode from 'qrcode'

/**
 * Renders arbitrary text (e.g. a raw KHQR EMV payload) as a QR code
 * data URL so the frontend can display it without a QR library.
 */
export async function renderQrDataUrl(text: string, width = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
