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
