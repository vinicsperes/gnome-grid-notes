// What a note file means, with no GNOME imports so it can be tested on its own.
//
// A note is a small JSON file anyone can write by hand or from a script:
//
//   {"title": "...", "date": "2026-10-29", "items": ["..."], "next": "..."}
//
// Fields this code doesn't know about are kept when a note is saved, so other
// tools can add their own.

const KNOWN = ['title', 'date', 'items', 'next', 'grid'];

// Portuguese field names from the first version of this project's file format.
const LEGACY = {titulo: 'title', data: 'date', itens: 'items', proximo: 'next'};

function renamed(raw) {
    const out = {};
    for (const [key, value] of Object.entries(raw))
        out[LEGACY[key] ?? key] = value;
    return out;
}

function validGrid(grid) {
    if (!grid || typeof grid !== 'object')
        return null;
    const {x, y, w, h} = grid;
    if (![x, y, w].every(Number.isInteger) || w < 1 || x < 0 || y < 0)
        return null;
    return Number.isInteger(h) && h > 0 ? {x, y, w, h} : {x, y, w};
}

export function parseNote(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('a note must be a JSON object');
    const {title, date, items, next, grid, ...extra} = renamed(raw);
    return {
        title: title === undefined || title === null ? '' : String(title),
        date: date ? String(date) : '',
        items: Array.isArray(items) ? items.map(String) : [],
        next: next ? String(next) : '',
        grid: validGrid(grid),
        extra,
    };
}

export function serializeNote(note) {
    const out = {};
    if (note.title)
        out.title = note.title;
    if (note.date)
        out.date = note.date;
    out.items = note.items ?? [];
    if (note.next)
        out.next = note.next;
    if (note.grid)
        out.grid = note.grid;
    for (const [key, value] of Object.entries(note.extra ?? {})) {
        if (!KNOWN.includes(key))
            out[key] = value;
    }
    return `${JSON.stringify(out, null, 2)}\n`;
}

export function isBlank(note) {
    return !note.title.trim() && !note.next.trim() && !note.items.some(item => item.trim());
}

// "Meu Projeto!" -> "meu-projeto.json", avoiding names already taken.
export function fileNameFor(title, taken) {
    const slug = title
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
        .replace(/-+$/, '') || 'note';
    let name = `${slug}.json`;
    for (let n = 2; taken.includes(name); n++)
        name = `${slug}-${n}.json`;
    return name;
}

// Whole days from an ISO date to today, or null if the date can't be read.
export function daysSince(iso, today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m)
        return null;
    const then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((now - then) / 86400000);
}

export function isoDay(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
