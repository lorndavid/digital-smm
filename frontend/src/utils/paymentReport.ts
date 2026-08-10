import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Payment statement → PDF report.
 *
 * Builds a clean A4 report (brand header, account + period info, summary
 * boxes, a detailed transactions table and a totals footer) and downloads it
 * as `digitalsmm-payments-<date>.pdf`. Used by the customer Payments page with
 * the Today / This week / This month / All time range presets.
 */

export type ReportRange = 'today' | 'week' | 'month' | 'all'

export const REPORT_RANGE_OPTIONS: Array<{ value: ReportRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

export const REPORT_RANGE_LABEL: Record<ReportRange, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'All time',
}

export interface ReportPayment {
  /** ISO date of the transaction (approvedAt ?? createdAt). */
  date: string
  referenceId: string
  purpose: 'topup' | 'order'
  description: string
  method: string
  status: string
  amount: number
}

export interface ReportAccount {
  name: string
  email: string
}

/** Inclusive bounds for a preset range, or null for "all time". */
export function reportRangeBounds(range: ReportRange): { from: Date; to: Date } | null {
  if (range === 'all') return null
  const to = new Date()
  const from = new Date(to)
  if (range === 'today') {
    from.setHours(0, 0, 0, 0)
  } else if (range === 'week') {
    // Week starts on Monday.
    const day = (to.getDay() + 6) % 7
    from.setDate(to.getDate() - day)
    from.setHours(0, 0, 0, 0)
  } else {
    from.setDate(1)
    from.setHours(0, 0, 0, 0)
  }
  return { from, to }
}

export function isInRange(dateIso: string, bounds: { from: Date; to: Date } | null): boolean {
  if (!bounds) return true
  const d = new Date(dateIso)
  return d >= bounds.from && d <= bounds.to
}

// ---------------------------------------------------------------------------
// Formatting helpers (locale-consistent with the app)
// ---------------------------------------------------------------------------

function money(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function dateOnly(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const BRAND: [number, number, number] = [108, 59, 255] // #6c3bff
const BRAND_DEEP: [number, number, number] = [40, 22, 92]
const BRAND_SOFT: [number, number, number] = [243, 240, 255]
const INK: [number, number, number] = [26, 29, 41]
const MUTED: [number, number, number] = [107, 114, 128]
const LINE: [number, number, number] = [226, 230, 238]
const ROW_ALT: [number, number, number] = [249, 250, 252]

/** Text colour per payment status. */
function statusColor(status: string): [number, number, number] {
  switch (status) {
    case 'paid':
      return [5, 150, 105]
    case 'pending':
      return [217, 119, 6]
    case 'scanned':
      return [2, 132, 199]
    case 'refunded':
      return [100, 116, 139]
    case 'failed':
      return [220, 38, 38]
    default:
      return MUTED
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export interface PaymentReportOptions {
  range: ReportRange
  account: ReportAccount
  payments: ReportPayment[]
}

/** Generates and downloads the PDF statement. */
export function downloadPaymentReport(options: PaymentReportOptions): void {
  const { range, account, payments } = options
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2

  const now = new Date()
  const settled = payments.filter((p) => p.status === 'paid')
  const topupTotal = settled.filter((p) => p.purpose === 'topup').reduce((s, p) => s + p.amount, 0)
  const spendTotal = settled.filter((p) => p.purpose === 'order').reduce((s, p) => s + p.amount, 0)

  const bounds = reportRangeBounds(range)
  const periodText = bounds
    ? `${REPORT_RANGE_LABEL[range]} · ${dateOnly(bounds.from)} – ${dateOnly(bounds.to)}`
    : 'All time'

  // --- Header band -------------------------------------------------------
  doc.setFillColor(...BRAND_DEEP)
  doc.rect(0, 0, pageW, 96, 'F')
  doc.setFillColor(...BRAND)
  doc.rect(0, 96, pageW, 3, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(21)
  doc.text('DigitalSMM', margin, 46)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(201, 187, 254)
  doc.text('Payment Statement', margin, 64)

  doc.setFontSize(9)
  doc.setTextColor(201, 187, 254)
  doc.text('GENERATED', pageW - margin, 38, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(`${dateLabel(now.toISOString())}`, pageW - margin, 52, { align: 'right' })

  // --- Account + period info ---------------------------------------------
  let y = 128
  const infoRow = (label: string, value: string, x = margin): void => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), x, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(value, x, y + 15)
  }
  infoRow('Account', account.name || '—')
  infoRow('Email', account.email || '—', margin + 170)
  infoRow('Period', periodText, margin + 340)
  infoRow('Transactions', String(payments.length), pageW - margin - 90)

  y += 26
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(
    'This statement lists your KHQR payments — wallet-funded orders are listed on your Orders page.',
    margin,
    y,
  )

  // --- Summary boxes ------------------------------------------------------
  y += 24
  const boxW = (contentW - 20) / 3
  const boxH = 62
  const boxes: Array<{ label: string; value: string; tint: [number, number, number] }> = [
    { label: 'Top-ups (settled)', value: money(topupTotal), tint: BRAND_SOFT },
    { label: 'Service spend (settled)', value: money(spendTotal), tint: BRAND_SOFT },
    { label: 'Total settled', value: money(topupTotal + spendTotal), tint: BRAND_SOFT },
  ]
  boxes.forEach((box, i) => {
    const x = margin + i * (boxW + 10)
    doc.setFillColor(...box.tint)
    doc.roundedRect(x, y, boxW, boxH, 8, 8, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(box.label.toUpperCase(), x + 14, y + 22)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...BRAND)
    doc.text(box.value, x + 14, y + 45)
  })

  // --- Detail table -------------------------------------------------------
  const head: string[] = ['Date', 'Reference', 'Description', 'Method', 'Status', 'Amount']
  const body = payments.map((p) => [
    dateLabel(p.date),
    p.referenceId,
    p.description,
    p.method || '—',
    p.status,
    money(p.amount),
  ])

  const startY = y + boxH + 26
  if (payments.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text('No transactions in this period.', margin, startY)
  } else {
    autoTable(doc, {
      startY,
      margin: { left: margin, right: margin },
      head: [head],
      body,
      foot: [[{ content: 'TOTAL SETTLED', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', textColor: INK } }, { content: `${settled.length} paid`, styles: { fontStyle: 'bold', textColor: MUTED } }, { content: money(topupTotal + spendTotal), styles: { halign: 'right', fontStyle: 'bold', textColor: BRAND } }]],
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 7,
        textColor: INK,
        lineColor: LINE,
        lineWidth: 0.5,
      },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      footStyles: { fillColor: BRAND_SOFT, textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: {
        0: { cellWidth: 96 },
        1: { cellWidth: 110, fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = statusColor(String(data.cell.raw))
          data.cell.styles.fontStyle = 'bold'
        }
        const rawRow = (data.row.raw as unknown as string[] | null) ?? []
        if (data.section === 'body' && data.column.index === 5 && String(rawRow[4]) === 'paid') {
          data.cell.styles.textColor = [5, 150, 105]
        }
      },
      didDrawPage: (data) => {
        // Footer on every page (kept short so the two sides never collide).
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...MUTED)
        doc.text(`Page ${data.pageNumber}`, margin, pageH - 24)
        doc.text('DigitalSMM · Payment Statement', pageW - margin, pageH - 24, { align: 'right' })
        doc.setDrawColor(...LINE)
        doc.setLineWidth(0.5)
        doc.line(margin, pageH - 34, pageW - margin, pageH - 34)
      },
    })
  }

  const slug = now.toISOString().slice(0, 10)
  doc.save(`digitalsmm-payments-${slug}.pdf`)
}
