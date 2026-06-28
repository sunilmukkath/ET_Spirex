import type { BannerResult, ProfileResult } from '../api/client'

export async function exportChartPng(container: HTMLElement | null, filename: string) {
  if (!container) throw new Error('Chart not ready')
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('No chart SVG found to export')

  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const bbox = svg.getBoundingClientRect()
  const width = Math.max(bbox.width, 640)
  const height = Math.max(bbox.height, 360)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.crossOrigin = 'anonymous'

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to render chart image'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(2, 2)
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(url)

  const pngUrl = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = pngUrl
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`
  a.click()
}

export const exportMapPlaceholder = {
  message: 'Export PNG for maps is not supported yet. Use CSV export for coordinates.',
}

function csvEscape(value: string | number) {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function exportChartCsv(
  data: ProfileResult | BannerResult,
  filename: string,
) {
  const lines: string[] = []

  if ('headers' in data && data.headers && data.rows) {
    const headers = ['Row', ...data.headers.map((h) => h.label)]
    lines.push(headers.map(csvEscape).join(','))
    for (const row of data.rows) {
      lines.push(
        [
          row.label,
          ...row.cells.map((c) => c.col_pct ?? c.count ?? c.value ?? ''),
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  } else {
    const profile = data as ProfileResult
    if (profile.values?.length) {
      lines.push(['Label', 'Count', 'Percent'].map(csvEscape).join(','))
      for (const v of profile.values) {
        lines.push([v.label || v.code, v.count, v.percentage].map(csvEscape).join(','))
      }
    } else if (profile.top_words?.length) {
      lines.push(['Word', 'Count'].map(csvEscape).join(','))
      for (const w of profile.top_words) {
        lines.push([w.word, w.count].map(csvEscape).join(','))
      }
    } else if (profile.sections?.length) {
      lines.push(['Section', 'Metric', 'Value'].map(csvEscape).join(','))
      for (const s of profile.sections) {
        if (s.values?.length) {
          for (const v of s.values) {
            lines.push(
              [s.subquestion || '', v.label || v.code, v.count].map(csvEscape).join(','),
            )
          }
        } else {
          lines.push(
            [s.subquestion || '', 'mean', s.mean ?? ''].map(csvEscape).join(','),
          )
          lines.push(
            [s.subquestion || '', 'median', s.median ?? ''].map(csvEscape).join(','),
          )
        }
      }
    } else if (profile.points?.length) {
      lines.push(['Lat', 'Lng'].map(csvEscape).join(','))
      for (const p of profile.points) {
        lines.push([p.lat, p.lng].map(csvEscape).join(','))
      }
    } else {
      throw new Error('No tabular data to export')
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
