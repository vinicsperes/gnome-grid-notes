import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, layout, notes, rect, sleep} from './shell.js';

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

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
