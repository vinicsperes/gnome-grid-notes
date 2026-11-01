// Random actions from a fixed seed, checking after each one what must always be
// true. GRID_NOTES_SEED and GRID_NOTES_STEPS replay or lengthen a run.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, evaluate, layout, notes, removeNote, sleep, writeNote} from './shell.js';

const SEED = Number(process.env.GRID_NOTES_SEED ?? 20261101);
const STEPS = Number(process.env.GRID_NOTES_STEPS ?? 120);

let state = SEED;
function random() {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = list => list[Math.floor(random() * list.length)];
const between = (a, b) => Math.round(a + random() * (b - a));

const cards = () => Object.keys(layout());
const onScreen = id => board(`(a => {
    const [x, y] = a.get_transformed_position();
    return {x, y, width: a.width, height: a.height};
})(b._cards.get(${JSON.stringify(id)}).actor)`);
const anyCard = () => pick(cards().filter(id => !id.startsWith('.')));
const typing = text => drive(`await driver.type(${JSON.stringify(text)});`);
const key = name => drive(`await driver.tap(Clutter.KEY_${name});`);
const screen = {width: 1920, height: 1080};

let written = 0;

const ACTIONS = {
    async drag() {
        const r = onScreen(anyCard());
        await drive(`await driver.drag(${r.x + r.width / 2}, ${r.y + 14}, ${between(40, screen.width - 40)}, ${between(60, screen.height - 40)}, 10, 8);`);
    },
    async resize() {
        const r = onScreen(anyCard());
        const x = pick([r.x + 4, r.x + r.width - 4]);
        await drive(`await driver.drag(${x}, ${r.y + r.height - 4}, ${x + between(-300, 300)}, ${r.y + r.height + between(-150, 200)}, 10, 8);`);
    },
    async wheel() {
        const r = onScreen(anyCard());
        const direction = pick(['UP', 'DOWN']);
        await drive(`driver.move(${r.x + 40}, ${r.y + 20}); await driver.wait(40);
            for (let i = 0; i < ${between(1, 5)}; i++) { driver.scroll(Clutter.ScrollDirection.${direction}); await driver.wait(20); }`);
    },
    async remove() {
        if (cards().length < 3)
            return;
        const r = onScreen(anyCard());
        const [x, y] = [r.x + r.width - 18, r.y + 18];
        await drive(`await driver.click(${x}, ${y}); await driver.wait(60); await driver.click(${x}, ${y});`);
    },
    async undo() {
        if (!board('b._undo'))
            return;
        const [x, y] = board('(t => { const [px, py] = t.get_transformed_position(); return [px + t.width - 30, py + t.height / 2]; })(b._toast)');
        await drive(`await driver.click(${x}, ${y});`);
    },
    async focus() {
        board('b.toggleFocus()');
    },
    async write() {
        board('b.newNote()');
        await sleep(120);
        await typing(`Note ${++written}`);
        await key('Return');
        await typing('a line');
        if (random() < 0.5)
            await drive('await driver.tap(Clutter.KEY_t, Clutter.KEY_Control_L);');
        await key('Return');
        await typing('another');
        await key('Escape');
    },
    async edit() {
        const r = onScreen(anyCard());
        await drive(`await driver.click(${r.x + 100}, ${r.y + between(6, Math.min(r.height - 6, 140))}, 2);`);
        await sleep(120);
        if (board('b._composer') !== null) {
            await typing(' x');
            await key('Escape');
        }
    },
    async tick() {
        const found = board(`(() => {
            for (const c of b._cards.values()) {
                const [index] = c._checks.keys();
                if (index === undefined) continue;
                const [x, y] = c._checks.get(index).mark.get_transformed_position();
                if (y > 40 && y < ${screen.height - 40}) return [x + 9, y + 9];
            }
            return null;
        })()`);
        if (found)
            await drive(`await driver.click(${found[0]}, ${found[1]});`);
    },
    async script() {
        const name = `script-${between(1, 4)}.json`;
        if (random() < 0.3)
            removeNote(name);
        else
            writeNote(name, {title: name, items: Array.from({length: between(0, 40)}, (_, i) => `line ${i}`)});
    },
    async broken() {
        writeNote('broken.json', pick(['{ not json', '[1, 2]', '{"title": "fixed again"}']));
    },
};

function check(step, name) {
    const where = `step ${step} (${name}), seed ${SEED}`;
    assert.equal(board('b._gesture'), null, `${where}: no gesture left behind`);
    const items = board('b._layout');
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const [a, c] = [items[i], items[j]];
            const apart = a.x + a.w <= c.x || c.x + c.w <= a.x || a.y + a.h <= c.y || c.y + c.h <= a.y;
            assert.ok(apart, `${where}: ${a.id} and ${c.id} overlap`);
        }
    }
    assert.deepEqual(items.map(i => i.id).sort(), board('[...b._cards.keys()]').sort(),
        `${where}: a card for each place and a place for each card`);
    const max = board('b._maxScroll()');
    const scroll = board('b._scroll');
    assert.ok(scroll >= 0 && scroll <= max, `${where}: scroll ${scroll} within ${max}`);
    assert.equal(board('b._sheet.y') + scroll, 0, `${where}: the sheet is where it should be`);
    assert.equal(board('b._more.visible'), max > 0, `${where}: the arrow shows only when needed`);
    assert.equal(board('b._toast.visible'), board('b._undo !== null'), `${where}: the undo message`);
    for (const id of cards()) {
        const at = board(`(c => {
            const a = c.actor;
            const r = b._rectOf(b._layout.find(i => i.id === c.file), b._metrics());
            return [a.x === r.x && a.y === r.y && a.width === r.width && a.height === r.height, a.opacity, a.scale_x];
        })(b._cards.get(${JSON.stringify(id)}))`);
        assert.deepEqual(at, [true, 255, 1], `${where}: ${id} at rest in its place`);
    }
    assert.deepEqual(errors(), [], `${where}: nothing logged an error`);
}

test(`${STEPS} random actions keep everything tidy`, {timeout: 600000}, async () => {
    const names = Object.keys(ACTIONS);
    for (let step = 1; step <= STEPS; step++) {
        const name = pick(names);
        await ACTIONS[name]();
        await sleep(900);
        if (board('b._composer') !== null)
            await key('Escape');
        check(step, name);
    }
});

test('all the files are still whole', () => {
    for (const [name, note] of Object.entries(notes({lenient: true}))) {
        assert.equal(typeof note, 'object', name);
        for (const item of note.items ?? [])
            assert.ok(['string', 'object', 'number'].includes(typeof item), name);
    }
});

test('it comes off and goes back on cleanly, at awkward moments', async () => {
    const count = () => evaluate(`global.window_group.get_children().filter(a => a.get_name() === 'grid-notes').length`);
    const cycle = async () => {
        evaluate(`Main.extensionManager.disableExtension('grid-notes@desktop'); 0`);
        await sleep(100);
        assert.equal(count(), 0, 'nothing left in the window group');
        evaluate(`Main.extensionManager.enableExtension('grid-notes@desktop'); 0`);
        await sleep(700);
        assert.equal(count(), 1);
    };
    // Right after deleting, while the card is still fading out.
    const r = onScreen(anyCard());
    const [x, y] = [r.x + r.width - 18, r.y + 18];
    await drive(`await driver.click(${x}, ${y}); await driver.wait(60); await driver.click(${x}, ${y});`);
    await cycle();
    // In the middle of a drag.
    const d = onScreen(anyCard());
    await drive(`driver.move(${d.x + 100}, ${d.y + 14}); await driver.wait(60); driver.press(); await driver.wait(40); driver.move(${d.x + 160}, ${d.y + 80}); await driver.wait(40);`);
    await cycle();
    await drive('driver.release(); await driver.wait(60);');
    // With the words half typed.
    board('b.newNote()');
    await sleep(150);
    await typing('Half written');
    await cycle();
    assert.ok(notes({lenient: true})['half-written.json'], 'what was typed got saved');
    // With the arrow on its way in.
    writeNote('tall.json', {items: Array.from({length: 70}, (_, i) => `line ${i}`)});
    await sleep(300);
    await cycle();
    assert.deepEqual(errors(), []);
});
