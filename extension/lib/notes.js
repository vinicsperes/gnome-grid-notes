// What a note file means, with no GNOME imports so it can be tested on its own.
//
// A note is a small JSON file anyone can write by hand or from a script:
//
//   {"title": "...", "date": "2026-10-29", "items": ["..."], "next": "..."}
//
// Saving always starts from the text on disk and changes only the fields being
// saved, so hand edits, unusual values and fields from other tools all survive.

// Portuguese field names from the first version of this project's file format.
const LEGACY = new Map([
    ['titulo', 'title'],
    ['data', 'date'],
    ['itens', 'items'],
    ['proximo', 'next'],
]);

const CONTENT = ['title', 'date', 'items', 'next'];

// No real grid comes near this, and a card a million rows tall would only hurt.
const MAX_CELLS = 1000;

const inRange = (n, min) => Number.isInteger(n) && n >= min && n <= MAX_CELLS;

function parseObject(text) {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('a note must be a JSON object');
    return raw;
}

function field(raw, name) {
    for (const [legacy, current] of LEGACY) {
        if (current === name && Object.hasOwn(raw, legacy) && !Object.hasOwn(raw, name))
            return raw[legacy];
    }
    return Object.hasOwn(raw, name) ? raw[name] : undefined;
}

// Unusual values are shown as they are rather than dropped.
function asText(value) {
    if (value === undefined || value === null)
        return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function asItems(value) {
    if (value === undefined || value === null)
        return [];
    return (Array.isArray(value) ? value : [value]).map(asText);
}

function validGrid(grid) {
    if (!grid || typeof grid !== 'object')
        return null;
    const {x, y, w, h} = grid;
    if (!inRange(x, 0) || !inRange(y, 0) || !inRange(w, 1))
        return null;
    return inRange(h, 1) ? {x, y, w, h} : {x, y, w};
}

export function parseNote(text) {
    const raw = parseObject(text);
    return {
        title: asText(field(raw, 'title')),
        date: asText(field(raw, 'date')),
        items: asItems(field(raw, 'items')),
        next: asText(field(raw, 'next')),
        grid: validGrid(field(raw, 'grid')),
    };
}

const render = raw => `${JSON.stringify(raw, null, 2)}\n`;

export const emptyNote = () => parseNote('{}');

// The note's text with a new position, or the same text if it's already there.
// Everything else in the file, formatting aside, stays exactly as it was.
export function withGrid(text, grid) {
    const raw = parseObject(text);
    if (JSON.stringify(validGrid(field(raw, 'grid'))) === JSON.stringify(grid))
        return text;
    return render({...raw, grid});
}

const present = value => value !== undefined && value !== null && value !== '';

// The note's text with some of its contents changed. Starts from `text` when
// the file exists, so whatever isn't in `changes` stays as it is on disk.
export function withContent(text, changes, grid = null) {
    const raw = text === null ? {} : parseObject(text);
    const current = name => (Object.hasOwn(changes, name) ? changes[name] : field(raw, name));
    const [title, date, next] = ['title', 'date', 'next'].map(current);
    const items = current('items') ?? [];
    const others = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!LEGACY.has(key) && !CONTENT.includes(key) && key !== 'grid')
            others[key] = value;
    }
    const place = grid ?? validGrid(field(raw, 'grid'));
    return render({
        ...(present(title) ? {title} : {}),
        ...(present(date) ? {date} : {}),
        items,
        ...(present(next) ? {next} : {}),
        ...(place ? {grid: place} : {}),
        ...others,
    });
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
