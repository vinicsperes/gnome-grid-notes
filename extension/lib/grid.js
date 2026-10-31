// The grid rules, free of any GNOME import so they can be tested on their own.
//
// A layout is a list of {id, x, y, w, h} in cell units. Two rules always hold
// after any operation here: no two items overlap, and every item has floated up
// as far as it can. Together they are what keeps the desktop tidy no matter
// where a card gets dropped.

const byPosition = (a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id));

export function overlaps(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function clamp(item, cols) {
    const w = Math.max(1, Math.min(item.w, cols));
    return {
        ...item,
        w,
        h: Math.max(1, item.h),
        x: Math.max(0, Math.min(item.x, cols - w)),
        y: Math.max(0, item.y),
    };
}

// Lowest y at or above `from` where the item fits among those already placed.
function settle(item, placed, from = 0) {
    let y = from;
    for (;;) {
        const hit = placed.filter(p => overlaps({...item, y}, p));
        if (!hit.length)
            return y;
        y = Math.max(...hit.map(p => p.y + p.h));
    }
}

// Floats every item up. Items are handled top to bottom, so the relative order
// in a column never changes just by compacting.
export function compact(items, cols, order = byPosition) {
    const placed = [];
    for (const raw of [...items].sort(order)) {
        const item = clamp(raw, cols);
        placed.push({...item, y: settle(item, placed)});
    }
    return placed;
}

// Finds a slot for a new item: the highest free spot, preferring the leftmost
// columns of the `block` columns nearest the origin. Scanning this way fills
// whichever column is shortest, so plain equal-width cards end up as a masonry.
export function place(item, items, cols, block = cols) {
    const start = Math.min(block, cols);
    const w = Math.min(item.w, cols);
    let best = null;
    for (let x = start - w; x >= 0; x--) {
        const y = settle({...item, w, x}, items);
        if (!best || y < best.y)
            best = {...item, w, x, y};
    }
    return best ?? {...item, w, x: 0, y: settle({...item, w, x: 0}, items)};
}

// Where the dragged item sorts among the others. An item it overlaps counts as
// passed once the dragged top is above that item's middle, so a card can take
// another's place without being dragged all the way past its top edge.
function dragSortY(target, others) {
    let y = target.y;
    for (const other of others) {
        if (overlaps(target, other) && target.y < other.y + other.h / 2)
            y = Math.min(y, other.y - 0.5);
    }
    return y;
}

function reflow(items, id, target, cols) {
    const others = items.filter(i => i.id !== id);
    const sortY = dragSortY(target, others);
    const y = item => (item.id === id ? sortY : item.y);
    return compact([...others, target], cols, (a, b) =>
        y(a) - y(b) || (b.id === id) - (a.id === id) || byPosition(a, b));
}

export function move(items, id, x, y, cols) {
    const item = items.find(i => i.id === id);
    if (!item)
        return items;
    return reflow(items, id, clamp({...item, x, y}, cols), cols);
}

export function resize(items, id, w, h, cols) {
    const item = items.find(i => i.id === id);
    if (!item)
        return items;
    return reflow(items, id, clamp({...item, w, h}, cols), cols);
}

// Pixel geometry. `x` counts from the right edge of the area, so notes stay
// anchored to that side when the screen gets narrower or wider.
export function metrics(area, {cell, row, gap, margin}) {
    const stepX = cell + gap;
    const stepY = row + gap;
    const cols = Math.max(1, Math.floor((area.width - 2 * margin + gap) / stepX));
    const right = area.x + area.width - margin;
    const top = area.y + margin;
    return {
        cols,
        stepX,
        stepY,
        widthOf: w => w * stepX - gap,
        heightOf: h => h * stepY - gap,
        toPixels: ({x, y, w}) => ({px: right - (x + w) * stepX + gap, py: top + y * stepY}),
        toCell: (px, py, w) => ({
            x: Math.round((right + gap - px) / stepX) - w,
            y: Math.round((py - top) / stepY),
        }),
        rowsFor: pixels => Math.max(1, Math.ceil((pixels + gap) / stepY)),
    };
}
