import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, evaluate, notes, rect, screenshot, sleep, writeNote} from './shell.js';

const FILE = 'list.json';
const note = {
    titulo: 'Groceries',
    data: '2026-10-01',
    itens: ['from the market', {text: 'eggs', done: false}, {text: 'milk', done: true}],
    color: 'red',
    grid: {x: 0, y: 0, w: 2},
};
const card = `b._cards.get('${FILE}')`;

const markAt = async index => {
    const [x, y] = board(`${card}._checks.get(${index}).mark.get_transformed_position()`);
    return {x: x + 9, y: y + 9};
};
const clickMark = async index => {
    const {x, y} = await markAt(index);
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(100);
};
const saved = () => notes()[FILE];
const KEY = {enter: 'Clutter.KEY_Return', esc: 'Clutter.KEY_Escape'};
const tap = key => drive(`await driver.tap(${KEY[key]});`);
const type = text => drive(`await driver.type(${JSON.stringify(text)});`);
const ctrlT = () => drive('await driver.tap(Clutter.KEY_t, Clutter.KEY_Control_L);');

test('a note with checkboxes shows them', async () => {
    writeNote(FILE, note);
    await sleep(500);
    assert.deepEqual(board(`[...${card}._checks.keys()]`), [1, 2]);
    const child = i => board(`${card}._checks.get(${i}).mark.child.style_class`);
    assert.equal(child(1), 'grid-notes-check');
    assert.equal(child(2), 'grid-notes-check grid-notes-check-done');
});

test('clicking a checkbox ticks it and changes nothing else in the file', async () => {
    const before = rect(FILE);
    await clickMark(1);
    assert.deepEqual(saved(), {
        ...note,
        itens: ['from the market', {text: 'eggs', done: true}, {text: 'milk', done: true}],
    });
    assert.equal(board(`${card}.note.items[1].done`), true);
    assert.equal(board(`${card}._checks.get(1).mark.child.style_class`), 'grid-notes-check grid-notes-check-done');
    assert.deepEqual(rect(FILE), before, 'the card did not move');
    assert.equal(board('b._gesture'), null);
});

test('clicking it again clears it, without ever opening the editor', async () => {
    await clickMark(1);
    assert.equal(saved().itens[1].done, false);
    assert.equal(board('b._composer'), null, 'two quick clicks are not a double click');
});

test('a checkbox that changed on disk is not overwritten', async () => {
    const {x, y} = await markAt(1);
    // Taken while the board hasn't noticed the file yet.
    writeNote(FILE, {...note, itens: ['from the market', {text: 'bread', done: false}]});
    await drive(`await driver.click(${x}, ${y});`);
    assert.deepEqual(saved().itens[1], {text: 'bread', done: false});
    await sleep(500);
    assert.equal(board(`${card}.note.items[1].text`), 'bread', 'the card caught up');
    writeNote(FILE, note);
    await sleep(500);
});

test('the rest of the card still drags', async () => {
    const r = rect(FILE);
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, ${r.x - 200}, ${r.y + 20});`);
    await sleep(500);
    assert.notEqual(saved().grid.x, 0);
});

test('the marker in the editor goes from bullet to checkbox to ticked and back', async () => {
    writeNote(FILE, {title: 'Groceries', items: ['one']});
    await sleep(500);
    const r = rect(FILE);
    // Off the text, so that the caret goes to the end of the note.
    await drive(`await driver.click(${r.x + 150}, ${r.y + 6}, 2);`);
    await sleep(300);
    const row = 'b._composer._rows[0]';
    const [x, y] = board(`${row}.mark.get_transformed_position()`);
    const items = () => board('b._composer.values().items');
    assert.deepEqual(items(), ['one']);
    await drive(`await driver.click(${x + 9}, ${y + 9});`);
    assert.deepEqual(items(), [{text: 'one', done: false}]);
    await drive(`await driver.click(${x + 9}, ${y + 9});`);
    assert.deepEqual(items(), [{text: 'one', done: true}]);
    await drive(`await driver.click(${x + 9}, ${y + 9});`);
    assert.deepEqual(items(), ['one']);
    assert.equal(board('b._composer !== null'), true, 'still writing');
});

test('ctrl+T does the same from the keyboard, and new lines carry on as checkboxes', async () => {
    await ctrlT();
    await type('x');
    await tap('enter');
    await type('two');
    await sleep(100);
    assert.deepEqual(board('b._composer.values().items'),
        [{text: 'onex', done: false}, {text: 'two', done: false}]);
    await tap('esc');
    await sleep(400);
    assert.deepEqual(saved().items, [{text: 'onex', done: false}, {text: 'two', done: false}]);
    assert.deepEqual(board(`[...${card}._checks.keys()]`), [0, 1], 'shown right after saving');
});

test('opening and closing a note with checkboxes saves nothing', async () => {
    const before = JSON.stringify(saved());
    const r = rect(FILE);
    await drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`);
    await sleep(300);
    await tap('esc');
    await sleep(300);
    assert.equal(JSON.stringify(saved()), before);
});

test('accented text stays in place through a tick', async () => {
    writeNote(FILE, {items: [{text: 'ação às três', done: false}]});
    await sleep(500);
    await clickMark(0);
    assert.deepEqual(saved().items, [{text: 'ação às três', done: true}]);
    if (process.env.GRID_NOTES_SHOT)
        screenshot(process.env.GRID_NOTES_SHOT);
});

test('the marker stays with the first line of text that wraps', async () => {
    writeNote(FILE, {items: [
        {text: 'a line long enough that it has to wrap around onto a second one', done: false},
        'and a bullet that is also long enough to wrap around onto a second one',
    ]});
    await sleep(500);
    for (const row of [0, 1]) {
        const [mark, label] = board(`${card}.body.get_child_at_index(${row}).get_children()` +
            '.map(child => child.get_transformed_position()[1])');
        const lines = board(`${card}.body.get_child_at_index(${row}).get_height()`);
        assert.ok(lines > 30, 'it did wrap');
        assert.equal(mark, label);
    }
});

test('a brand new note can start with a checkbox', async () => {
    board('b.newNote()');
    await sleep(300);
    await type('Chores');
    await tap('enter');
    await ctrlT();
    await type('dishes');
    await tap('esc');
    await sleep(400);
    assert.deepEqual(notes()['chores.json'].items, [{text: 'dishes', done: false}]);
    assert.deepEqual(board(`[...b._cards.get('chores.json')._checks.keys()]`), [0]);
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
    assert.equal(evaluate('1'), 1);
});
