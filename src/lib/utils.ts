export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CR', {
        style: 'currency',
        currency: 'CRC',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d)
}

export function formatDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('es-CR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).format(d)
}

export function formatTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat('es-CR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).format(d)
}

export function generateId(): string {
    return crypto.randomUUID()
}

// ─── Costa Rica time helpers ─────────────────────────────────────────────────
// CR is UTC-6 year-round (no DST). We apply the offset manually instead of
// relying on Intl timezone support, which is absent in small-icu Electron builds
// and would silently fall back to UTC (showing times 6 h ahead).
const CR_OFFSET_MS = -6 * 60 * 60 * 1000

function toCR(v: Date | string): Date {
    if (typeof v !== 'string') return new Date(v.getTime() + CR_OFFSET_MS)
    // Normalize SQLite datetime format ("YYYY-MM-DD HH:MM:SS", space, no Z) to ISO UTC
    let s = v
    if (s.length >= 10 && s[10] === ' ') s = s.slice(0, 10) + 'T' + s.slice(11)
    if (!s.endsWith('Z') && !s.includes('+') && !/-\d{2}:\d{2}$/.test(s)) s += 'Z'
    return new Date(new Date(s).getTime() + CR_OFFSET_MS)
}

const MONTHS_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

export function crTime(v: Date | string | null | undefined): string {
    if (!v) return '--'
    const d = toCR(v as Date | string)
    const h = d.getUTCHours()
    const m = String(d.getUTCMinutes()).padStart(2, '0')
    return `${h % 12 || 12}:${m} ${h >= 12 ? 'p.m.' : 'a.m.'}`
}

export function crDateStr(v: Date | string | null | undefined): string {
    if (!v) return ''
    const d = toCR(v as Date | string)
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function crDateTime(v: Date | string | null | undefined): string {
    if (!v) return ''
    return `${crDateStr(v)} · ${crTime(v)}`
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ')
}

export function normalizeStr(s: string): string {
    return s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()
}

function phoneticNorm(s: string): string {
    return normalizeStr(s)
        .replace(/qu/g, 'k')
        .replace(/c(?=[ei])/g, 's')
        .replace(/c/g, 'k')
        .replace(/ph/g, 'f')
        .replace(/ll/g, 'y')
        .replace(/v/g, 'b')
        .replace(/z/g, 's')
        .replace(/h/g, '')
        .replace(/w/g, 'b')
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length
    const row = Array.from({ length: n + 1 }, (_, i) => i)
    for (let i = 1; i <= m; i++) {
        let prev = row[0]
        row[0] = i
        for (let j = 1; j <= n; j++) {
            const tmp = row[j]
            row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1])
            prev = tmp
        }
    }
    return row[n]
}

export function fuzzyMatch(query: string, target: string): boolean {
    const q = phoneticNorm(query)
    const t = phoneticNorm(target)
    if (t.includes(q)) return true
    const threshold = Math.ceil(q.length / 3)
    if (threshold === 0) return false
    return levenshtein(q, t) <= threshold ||
        t.split(/\s+/).some(word => word.length >= 3 && levenshtein(q, word) <= threshold)
}
