/** Convert markdown (from Claude) to styled HTML for email. */
export function markdownToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const style = {
    body: 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.6; color: #3d2c1e; max-width: 600px;',
    h1: 'font-size: 20px; font-weight: 700; color: #3d2c1e; margin: 24px 0 8px 0; border-bottom: 2px solid #d4943a; padding-bottom: 4px;',
    h2: 'font-size: 17px; font-weight: 700; color: #3d2c1e; margin: 20px 0 6px 0;',
    h3: 'font-size: 15px; font-weight: 600; color: #5a4a3a; margin: 16px 0 4px 0;',
    li: 'margin: 4px 0;',
    p: 'margin: 8px 0;',
    hr: 'border: none; border-top: 1px solid #e8ddd0; margin: 16px 0;',
    strong: 'color: #3d2c1e;',
  }

  const lines = md.split('\n')
  let html = `<div style="${style.body}">`
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { if (inList) { html += '</ul>'; inList = false }; continue }

    if (trimmed.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h3 style="${style.h3}">${esc(trimmed.slice(4))}</h3>`
    } else if (trimmed.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h2 style="${style.h2}">${esc(trimmed.slice(3))}</h2>`
    } else if (trimmed.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<h1 style="${style.h1}">${esc(trimmed.slice(2))}</h1>`
    } else if (trimmed.startsWith('---')) {
      if (inList) { html += '</ul>'; inList = false }
      html += `<hr style="${style.hr}" />`
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      if (!inList) { html += '<ul style="padding-left: 20px; margin: 8px 0;">'; inList = true }
      const text = esc(trimmed.replace(/^[-•]\s*/, '')).replace(/\*\*(.*?)\*\*/g, `<strong style="${style.strong}">$1</strong>`)
      html += `<li style="${style.li}">${text}</li>`
    } else {
      if (inList) { html += '</ul>'; inList = false }
      const text = esc(trimmed).replace(/\*\*(.*?)\*\*/g, `<strong style="${style.strong}">$1</strong>`)
      html += `<p style="${style.p}">${text}</p>`
    }
  }
  if (inList) html += '</ul>'
  html += '</div>'
  return html
}
