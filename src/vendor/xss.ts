const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export default function xss(input: string): string {
  return String(input).replace(/[&<>"']/g, match => HTML_ESCAPE_MAP[match]!)
}
