import assert from 'node:assert/strict';
import {chmodSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';

import {board, drive, errors, evaluate, layout, notes, rect, sleep, writeNote} from './shell.js';

const KEY = {enter: 'Clutter.KEY_Return', esc: 'Clutter.KEY_Escape', tab: 'Clutter.KEY_Tab', back: 'Clutter.KEY_BackSpace'};
const tap = key => drive(`await driver.tap(${KEY[key]});`);
const type = text => drive(`await driver.type(${JSON.stringify(text)});`);
const addRect = () => board('(a => ({x: a.x, y: a.y, width: a.width, height: a.height}))(b._add)');

test('the add button waits at the next free slot', () => {
    const r = addRect();
    assert.equal(r.width, 300);
    const free = Object.keys(layout()).map(rect);
    assert.ok(free.every(c => r.x + r.width <= c.x || c.x + c.width <= r.x ||
        r.y + r.height <= c.y || c.y + c.height <= r.y));
});

test('clicking it opens an empty card and dims the desktop', async () => {
    const r = addRect();
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20});`);
    await sleep(400);
    assert.equal(board('b._composer !== null'), true);
    assert.equal(board('b._focus !== null'), true);
    assert.equal(board('b._scrim.visible'), true);
    assert.equal(board('b._add.opacity'), 0);
});

test('typing fills the note and the card grows bullet by bullet', async () => {
    await type('My note');
    await tap('enter');
    const before = board('b._composer.card.actor.height');
    await type('first thing');
    await tap('enter');
    await type('second thing');
    await tap('enter');
    await type('third thing');
    await sleep(350);
    assert.ok(board('b._composer.card.actor.height') > before);
    assert.deepEqual(board('b._composer.values()'),
        {title: 'My note', items: ['first thing', 'second thing', 'third thing'], next: ''});
});

test('enter on an empty bullet moves on to the next step', async () => {
    await tap('enter');
    await tap('enter');
    await type('ship it');
    assert.deepEqual(board('b._composer.values()'),
        {title: 'My note', items: ['first thing', 'second thing', 'third thing'], next: 'ship it'});
});

test('finishing saves a real file and goes back to the desktop', async () => {
    await tap('enter');
    await sleep(500);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
    assert.equal(board('b._scrim.visible'), false);
    const saved = notes()['my-note.json'];
    assert.equal(saved.title, 'My note');
    assert.deepEqual(saved.items, ['first thing', 'second thing', 'third thing']);
    assert.equal(saved.next, 'ship it');
    assert.match(saved.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof saved.grid.x, 'number');
    assert.ok(layout()['my-note.json']);
    assert.equal(board(`b._cards.get('my-note.json').file`), 'my-note.json');
});

test('a new note left empty leaves nothing behind', async () => {
    const before = Object.keys(notes()).length;
    const count = Object.keys(layout()).length;
    const r = addRect();
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20});`);
    await sleep(300);
    await tap('esc');
    await sleep(500);
    assert.equal(Object.keys(notes()).length, before);
    assert.equal(Object.keys(layout()).length, count);
    assert.equal(board('b._focus'), null);
});

test('double click edits, and only what changed is saved', async () => {
    const r = rect('6-cli.json');
    const date = notes()['6-cli.json'].date;
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    assert.equal(board('b._composer?.card.file'), '6-cli.json');
    await tap('esc');
    await sleep(400);
    assert.equal(notes()['6-cli.json'].date, date, 'no edits, date untouched');

    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await type(' now');
    await tap('esc');
    await sleep(400);
    const saved = notes()['6-cli.json'];
    assert.notEqual(saved.date, date);
    assert.equal(saved.next, 'call about the leak under the sink now');
});

test('backspace on an empty bullet removes it', async () => {
    const r = rect('my-note.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await drive('for (let i = 0; i < 8; i++) await driver.tap(Clutter.KEY_Up);');
    await tap('enter');
    await tap('enter');
    await tap('back');
    assert.deepEqual(board('b._composer.values().items'), ['first thing', 'second thing', 'third thing']);
    await tap('esc');
    await sleep(300);
});

test('clicking outside finishes the note', async () => {
    const r = rect('my-note.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    assert.equal(board('b._composer !== null'), true);
    await drive('await driver.click(200, 800);');
    await sleep(400);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
});

test('the shortcut brings notes forward and escape sends them back', async () => {
    board('b.toggleFocus()');
    await sleep(300);
    assert.equal(board('b._focus !== null'), true);
    assert.equal(board('global.window_group.get_children().at(-1).get_name()'), 'mural');
    await tap('esc');
    await sleep(300);
    assert.equal(board('b._focus'), null);
});

test('notes can still be dragged while in front of the windows', async () => {
    board('b.toggleFocus()');
    await sleep(300);
    const r = rect('5-website.json');
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, 300, 100);`);
    await sleep(500);
    assert.ok(rect('5-website.json').x < 400);
    await tap('esc');
    await sleep(200);
});

test('the real keyboard shortcuts work, including from in front of the windows', async () => {
    const chord = key => drive(`await driver.tap(Clutter.KEY_${key}, Clutter.KEY_Super_L, Clutter.KEY_Shift_L);`);
    await chord('M');
    await sleep(300);
    assert.equal(board('b._focus !== null'), true, 'opens');
    await chord('M');
    await sleep(300);
    assert.equal(board('b._focus'), null, 'closes');
    await chord('N');
    await sleep(300);
    assert.equal(board('b._composer !== null'), true, 'new note');
    await tap('esc');
    await sleep(400);
});

test('toggling focus while writing keeps what was typed', async () => {
    board('b.newNote()');
    await sleep(300);
    await type('Kept');
    board('b.toggleFocus()');
    await sleep(500);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
    assert.equal(notes()['kept.json'].title, 'Kept');
});

test('turning off in the middle of writing keeps what was typed', async () => {
    board('b.newNote()');
    await sleep(300);
    await type('Rescued');
    evaluate("Main.extensionManager.lookup('mural@vinicsperes').stateObj.disable(); 0");
    await sleep(300);
    assert.equal(notes()['rescued.json'].title, 'Rescued');
    evaluate("Main.extensionManager.lookup('mural@vinicsperes').stateObj.enable(); 0");
    await sleep(600);
    assert.ok(layout()['rescued.json']);
});

test('reaching for another card while writing saves the note first', async () => {
    board('b.newNote()');
    await sleep(300);
    await type('Half');
    const r = rect('3-synth.json');
    await drive(`await driver.click(${r.x + r.width - 18}, ${r.y + 18});`);
    await sleep(500);
    assert.equal(board('b._composer'), null);
    assert.equal(notes()['half.json'].title, 'Half');
    assert.ok(notes()['3-synth.json'], 'one click never deletes');
    assert.equal(readdirSync(join(process.env.MURAL_RUN, 'data', 'mural')).filter(f => f.startsWith('.')).length, 0);
    await drive('driver.move(100, 900); await driver.wait(150);');
});

test('a note with no title shows just its date up top', async () => {
    board('b.newNote()');
    await sleep(300);
    await tap('enter');
    await type('just a bullet');
    await tap('esc');
    await sleep(400);
    assert.deepEqual(notes()['note.json'].items, ['just a bullet']);
    const head = `b._cards.get('note.json').body.get_first_child()`;
    assert.equal(board(`${head}.style_class`), 'mural-head');
    assert.equal(board(`${head}.get_n_children()`), 1);
    assert.equal(board(`${head}.get_first_child().style_class`), 'mural-date');
});

test('a new note never lands on a file created while writing it', async () => {
    board('b.newNote()');
    await sleep(300);
    await type('Groceries');
    writeNote('groceries.json', {title: 'Groceries from a script', items: ['milk']});
    await sleep(300);
    await tap('esc');
    await sleep(500);
    assert.equal(notes()['groceries.json'].title, 'Groceries from a script');
    assert.equal(notes()['groceries-2.json'].title, 'Groceries');
});

test('escape still works after editing from in front of the windows', async () => {
    board('b.toggleFocus()');
    await sleep(300);
    const r = rect('2-thesis.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    assert.equal(board('b._composer !== null'), true);
    await tap('esc');
    await sleep(300);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus !== null'), true, 'still in front');
    await tap('esc');
    await sleep(300);
    assert.equal(board('b._focus'), null);
});

test('opening and closing a messy note does not count as an edit', async () => {
    writeNote('messy.json', {title: 'Messy ', date: '2026-01-02', items: ['a', '']});
    await sleep(900);
    const r = rect('messy.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await tap('esc');
    await sleep(400);
    assert.equal(notes()['messy.json'].date, '2026-01-02');
});

test('clearing out an existing note leaves it as it was', async () => {
    writeNote('clear.json', {title: 'x', date: '2026-01-02', items: []});
    await sleep(900);
    const r = rect('clear.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await tap('back');
    await tap('esc');
    await sleep(400);
    assert.equal(notes()['clear.json'].title, 'x');
    assert.equal(notes()['clear.json'].date, '2026-01-02');
});

test('an edit leaves alone what a script changed in the meantime', async () => {
    writeNote('both.json', {title: 'Both', items: ['original']});
    await sleep(900);
    const r = rect('both.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await drive('for (let i = 0; i < 8; i++) await driver.tap(Clutter.KEY_Up);');
    await drive('await driver.tap(Clutter.KEY_End);');
    await type('!');
    writeNote('both.json', {title: 'Both', items: ['original', 'added by a script']});
    await sleep(300);
    await tap('esc');
    await sleep(700);
    const saved = notes()['both.json'];
    assert.deepEqual(saved.items, ['original', 'added by a script']);
    assert.equal(saved.title, 'Both!');
    assert.deepEqual(board(`b._cards.get('both.json').note.items`), ['original', 'added by a script']);
});

test('pressing another card or its controls finishes the note', async () => {
    const r = rect('both.json');
    const other = rect('2-thesis.json');
    for (const [x, y] of [
        [other.x + other.width - 4, other.y + other.height - 4],
        [other.x + other.width - 18, other.y + 18],
        [other.x + 150, other.y + 40],
    ]) {
        await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
        await sleep(300);
        assert.equal(board('b._composer !== null'), true);
        await drive(`await driver.click(${x}, ${y});`);
        await sleep(350);
        assert.equal(board('b._composer'), null);
        assert.equal(board('b._gesture'), null);
        await drive('driver.move(100, 900); await driver.wait(100);');
        await sleep(200);
    }
    assert.ok(notes()['2-thesis.json'], 'still there');
});

test('the focus shortcut waits for a drag to end', async () => {
    const r = rect('2-thesis.json');
    await drive(`driver.move(${r.x + 150}, ${r.y + 20}); await driver.wait(80); driver.press(); await driver.wait(40);
        for (let i = 1; i <= 8; i++) { driver.move(${r.x + 150} + i * 3, ${r.y + 20}); await driver.wait(16); }`);
    board('b.toggleFocus()');
    await sleep(100);
    assert.equal(board('b._focus'), null);
    await drive('driver.release();');
    await sleep(500);
    assert.equal(board('b._gesture'), null);
});

test('a new note that cannot be saved keeps its text until it can', async () => {
    const dir = join(process.env.MURAL_RUN, 'data', 'mural');
    board('b.newNote()');
    await sleep(300);
    await type('Important');
    chmodSync(dir, 0o555);
    await tap('esc');
    await sleep(300);
    assert.equal(board('b._composer !== null'), true, 'stays open');
    assert.equal(board('b._composer.values().title'), 'Important');
    assert.equal(notes()['important.json'], undefined);
    chmodSync(dir, 0o755);
    await tap('esc');
    await sleep(500);
    assert.equal(board('b._composer'), null);
    assert.equal(notes()['important.json'].title, 'Important');
});

test('a second failure gives up and gives the desktop back', async () => {
    const dir = join(process.env.MURAL_RUN, 'data', 'mural');
    const before = readdirSync(dir).length;
    board('b.newNote()');
    await sleep(300);
    await type('Doomed');
    chmodSync(dir, 0o555);
    await tap('esc');
    await sleep(200);
    await tap('esc');
    await sleep(500);
    chmodSync(dir, 0o755);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
    assert.equal(board('global.stage.get_grab_actor() === null'), true);
    assert.equal(readdirSync(dir).length, before, 'nothing left behind');
    assert.equal(board(`[...b._cards.keys()].some(f => f.startsWith('.'))`), false);
});

test('a failed edit tells you and still gives the desktop back', async () => {
    const dir = join(process.env.MURAL_RUN, 'data', 'mural');
    const r = rect('clear.json');
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await type('more');
    chmodSync(dir, 0o555);
    chmodSync(join(dir, 'clear.json'), 0o444);
    await tap('esc');
    await sleep(300);
    assert.equal(board('b._composer !== null'), true, 'keeps the text at first');
    await tap('esc');
    await sleep(500);
    chmodSync(dir, 0o755);
    chmodSync(join(dir, 'clear.json'), 0o644);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
    assert.equal(board('global.stage.get_grab_actor() === null'), true);
});

test('the add button does not stay lit once it has moved away', async () => {
    const r = board('(a => ({x: a.x, y: a.y}))(b._add)');
    await drive(`driver.move(${r.x + 150}, ${r.y + 20}); await driver.wait(100); await driver.click(${r.x + 150}, ${r.y + 20});`);
    await sleep(300);
    await type('Moved');
    await tap('esc');
    await sleep(500);
    assert.equal(board('b._add.hover'), false);
    assert.equal(board('b._add.reactive'), true);
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
