import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, notes, rect, sleep, writeNote} from './shell.js';

const FILE = 'links.json';
const URL = 'https://example.com/docs';
const note = {
    title: 'Reading',
    items: [`read [the docs](${URL}) today`, 'no link here'],
    grid: {x: 0, y: 0, w: 3},
};
const card = `b._cards.get('${FILE}')`;

// Where a character of a line sits on screen.
const spotOf = (index, char) => board(`(label => {
    const [x, y] = label.get_transformed_position();
    const r = label.clutter_text.position_to_coords(${char});
    return [x + r[1] + 3, y + r[2] + 6];
})(${card}.body.get_child_at_index(1 + ${index}).get_last_child())`);

test('a link shows only its words', async () => {
    writeNote(FILE, note);
    await sleep(600);
    assert.equal(board(`${card}.body.get_child_at_index(1).get_last_child().text`), 'read the docs today');
    // Stubbed so the test never opens a browser.
    board('(b._open = url => { global.__opened = url; }, true)');
});

test('one click on the link opens it, and one on plain text does not', async () => {
    const [x, y] = spotOf(0, 7);
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(500);
    assert.equal(board('global.__opened'), URL);
    assert.equal(board('b._composer'), null, 'no editor opened');

    board('(global.__opened = null, true)');
    const [px, py] = spotOf(1, 3);
    await drive(`await driver.click(${px}, ${py});`);
    await sleep(500);
    assert.equal(board('global.__opened'), null);
});

test('double clicking plain text edits, with the cursor past the hidden address', async () => {
    const [x, y] = spotOf(0, 17);
    await drive(`await driver.click(${x}, ${y}, 2);`);
    await sleep(300);
    assert.notEqual(board('b._composer'), null);
    const text = board('global.stage.get_key_focus().get_text()');
    assert.equal(text, `read [the docs](${URL}) today`, 'the editor shows the text as written');
    const cursor = board('global.stage.get_key_focus().get_cursor_position()');
    assert.ok(cursor >= text.indexOf(' today'), `cursor ${cursor} is after the link`);
    board('b._composer.finish()');
    await sleep(400);
    assert.equal(notes()[FILE].items[0], `read [the docs](${URL}) today`, 'nothing was rewritten');
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
    assert.ok(rect(FILE));
});
