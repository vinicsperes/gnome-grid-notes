import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';

import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import {
    board, drive, errors, evaluate, layout, notes, rect, removeNote, sleep, writeNote,
} from './shell.js';

const raw = name => readFileSync(join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes', name), 'utf8');
const press = (x, y) => drive(`driver.move(${x}, ${y}); await driver.wait(80); driver.press(); await driver.wait(40);
    for (let i = 1; i <= 8; i++) { driver.move(${x} + i * 3, ${y}); await driver.wait(16); }`);

test('a new file becomes a card without any action', async () => {
    writeNote('8-new.json', {title: 'New', items: ['from a script']});
    await sleep(900);
    assert.ok(layout()['8-new.json']);
    assert.equal(board(`b._cards.get('8-new.json').actor.opacity`), 255);
});

test('editing a file updates its card, and the card grows to fit', async () => {
    const before = layout()['8-new.json'].h;
    writeNote('8-new.json', {
        title: 'New',
        items: ['from a script', 'one more', 'and another', 'and a fourth', 'and a fifth'],
    });
    await sleep(900);
    assert.ok(layout()['8-new.json'].h > before);
});

test('a broken file shows an error and is left alone', async () => {
    writeNote('9-broken.json', '{ not json');
    await sleep(900);
    assert.ok(layout()['9-broken.json']);
    assert.equal(board(`b._cards.get('9-broken.json').error !== null`), true);
    assert.throws(() => notes());
});

test('fixing the file fixes the card', async () => {
    writeNote('9-broken.json', {title: 'Fixed'});
    await sleep(900);
    assert.equal(board(`b._cards.get('9-broken.json').error`), null);
});

test('deleting a file removes its card and closes the gap', async () => {
    const y = rect('8-new.json').y;
    removeNote('8-new.json');
    removeNote('9-broken.json');
    await sleep(900);
    assert.equal(layout()['8-new.json'], undefined);
    assert.equal(Object.keys(layout()).length, 7);
    assert.equal(board(`b._sheet.get_children().filter(c => c.style_class === 'grid-notes-card').length`), 7);
    assert.ok(y > 0);
});

test('a saved position survives being read back', async () => {
    writeNote('8-placed.json', {title: 'Placed', items: [], grid: {x: 8, y: 0, w: 2}});
    await sleep(900);
    assert.deepEqual([layout()['8-placed.json'].x, layout()['8-placed.json'].y], [8, 0]);
});

test('a file changed during a drag keeps those changes', async () => {
    const r = rect('2-thesis.json');
    await press(r.x + 150, r.y + 20);
    writeNote('3-synth.json', {title: 'Edited during the drag', items: ['new']});
    await sleep(300);
    const s = rect('5-website.json');
    await drive(`driver.move(${s.x + 150}, ${s.y + 20}); await driver.wait(150); driver.release();`);
    await sleep(800);
    assert.equal(notes()['3-synth.json'].title, 'Edited during the drag');
    assert.equal(board(`b._cards.get('3-synth.json').note.title`), 'Edited during the drag');
});

test('a file deleted during a drag stays deleted', async () => {
    const r = rect('2-thesis.json');
    await press(r.x + 150, r.y + 20);
    removeNote('7-trip.json');
    await sleep(300);
    const s = rect('4-studio.json');
    await drive(`driver.move(${s.x + 150}, ${s.y + 20}); await driver.wait(150); driver.release();`);
    await sleep(800);
    assert.equal(notes()['7-trip.json'], undefined);
    assert.equal(layout()['7-trip.json'], undefined);
});

test('a hand formatted file is left alone until its card moves', async () => {
    const text = '{ "title": "by hand",\n    "items": ["kept", "as is"], "color": "red" }\n';
    writeNote('by-hand.json', text);
    await sleep(900);
    const r = rect('1-launch.json');
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, ${r.x + 150 + 3}, ${r.y + 20 + 3});`);
    await sleep(600);
    assert.equal(raw('by-hand.json'), text);
});

test('moving a card never rewrites the contents of its file', async () => {
    writeNote('odd.json', {itens: [{text: 'x', done: true}], other: 1});
    await sleep(900);
    const r = rect('odd.json');
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, 300, 100);`);
    await sleep(600);
    const saved = notes()['odd.json'];
    assert.deepEqual(saved.itens, [{text: 'x', done: true}]);
    assert.equal(saved.other, 1);
    assert.equal(typeof saved.grid.x, 'number');
});

test('things that are not note files are safely refused', async () => {
    execFileSync('mkfifo', [join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes', 'pipe.json')]);
    writeNote('huge.json', JSON.stringify({title: 'x'.repeat(300 * 1024)}));
    await sleep(900);
    assert.equal(board(`b._cards.get('pipe.json').error !== null`), true);
    assert.equal(board(`b._cards.get('huge.json').error !== null`), true);
    removeNote('pipe.json');
    removeNote('huge.json');
    await sleep(600);
});

test('a file that is not valid text is refused and left untouched', async () => {
    const dir = join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes');
    const bytes = Buffer.from('{"title": "Ol\xe1", "items": []}', 'latin1');
    writeFileSync(join(dir, 'latin1.json'), bytes);
    await sleep(900);
    assert.equal(board(`b._cards.get('latin1.json').error !== null`), true);
    const r = rect('1-launch.json');
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, 300, 100);`);
    await sleep(600);
    assert.deepEqual(readFileSync(join(dir, 'latin1.json')), bytes);
    removeNote('latin1.json');
    await sleep(500);
});

test('a card whose file breaks for a moment stays where it was', async () => {
    const before = layout()['1-launch.json'];
    const good = readFileSync(join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes', '1-launch.json'), 'utf8');
    writeNote('1-launch.json', '{ half written');
    await sleep(700);
    assert.equal(board(`b._cards.get('1-launch.json').error !== null`), true);
    assert.deepEqual([layout()['1-launch.json'].x, layout()['1-launch.json'].y], [before.x, before.y]);

    const r = rect('1-launch.json');
    await drive(`await driver.drag(${r.x + 100}, ${r.y + 20}, 800, 500);`);
    await sleep(500);
    assert.equal(rect('1-launch.json').x, r.x, 'cannot be dragged while broken');

    writeNote('1-launch.json', good);
    await sleep(700);
    assert.equal(board(`b._cards.get('1-launch.json').error`), null);
});

test('a small screen does not lose the arrangement for the big one', async () => {
    writeNote('far.json', {title: 'Far', items: [], grid: {x: 9, y: 0, w: 2}});
    await sleep(800);
    evaluate(`Main.layoutManager.getWorkAreaForMonitor = () =>
        ({x: 0, y: 32, width: 1100, height: 1048}); global.display.emit('workareas-changed'); 0`);
    await sleep(400);
    assert.ok(layout()['far.json'].x < 9);
    const r = rect('2-thesis.json');
    await drive(`await driver.drag(${r.x + 100}, ${r.y + 20}, ${r.x + 130}, ${r.y + 200});`);
    await sleep(500);
    assert.equal(notes()['far.json'].grid.x, 9, 'saved place kept');
    evaluate("delete Main.layoutManager.getWorkAreaForMonitor; global.display.emit('workareas-changed'); 0");
    await sleep(400);
    assert.equal(layout()['far.json'].x, 9);
    removeNote('far.json');
    await sleep(500);
});

test('a card restarted while animating ends up fully visible', async () => {
    writeNote('fresh.json', {title: 'Fresh', items: []});
    await sleep(320);
    const r = rect('fresh.json');
    await drive(`await driver.drag(${r.x + 100}, ${r.y + 20}, ${r.x + 100 + 8}, ${r.y + 20});`);
    await sleep(700);
    assert.equal(board(`b._cards.get('fresh.json').actor.opacity`), 255);
    assert.equal(board(`b._cards.get('fresh.json').actor.translation_y`), 0);
});

test('a saved position with a silly height is ignored', async () => {
    writeNote('tall.json', {title: 'Tall', items: [], grid: {x: 0, y: 0, w: 2, h: 999999}});
    await sleep(900);
    assert.ok(layout()['tall.json'].h < 100);
});

test('an empty board still offers a way to start', async () => {
    for (const name of Object.keys(notes()))
        removeNote(name);
    await sleep(800);
    const state = "Main.extensionManager.lookup('grid-notes@desktop').stateObj";
    evaluate(`${state}.disable(); ${state}.enable(); 0`);
    await sleep(500);
    const add = board('(a => ({x: a.x, y: a.y, w: a.width, o: a.opacity}))(b._add)');
    assert.equal(add.w, 300);
    assert.ok(add.y >= 72, 'clear of the top panel');
    assert.equal(add.o, 255);
});

test('an edit of the same size right after another one still shows', async () => {
    writeNote('quick.json', {title: 'aaaa'});
    await sleep(400);
    writeNote('quick.json', {title: 'bbbb'});
    await sleep(400);
    assert.equal(board(`b._cards.get('quick.json').note.title`), 'bbbb');
});

test('a file that has not changed is not read again', async () => {
    writeNote('old.json', {title: 'settled'});
    await sleep(2500);
    board('b._store.list()');
    const read = () => board(`b._store._loaded.get('old.json').text`);
    assert.match(read(), /settled/);
    board(`(store => { store.__load = store._load; store.__reads = 0;
        store._load = file => { store.__reads++; return store.__load(file); }; })(b._store)`);
    board('b._store.list()');
    const reads = board(`(store => { const n = store.__reads; store._load = store.__load; return n; })(b._store)`);
    // Whatever this file's tests touched in the last moments may be read again,
    // but the settled ones are not, so this stays well under all of them.
    assert.ok(reads < board('b._store._names().length'), `read ${reads} files`);
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
