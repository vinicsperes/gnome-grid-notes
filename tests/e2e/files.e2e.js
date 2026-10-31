import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, errors, layout, notes, rect, removeNote, sleep, writeNote} from './shell.js';

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
    assert.equal(board(`b.layer.get_children().filter(c => c.style_class === 'mural-card').length`), 7);
    assert.ok(y > 0);
});

test('a saved position survives being read back', async () => {
    writeNote('8-placed.json', {title: 'Placed', items: [], grid: {x: 8, y: 0, w: 2}});
    await sleep(900);
    assert.deepEqual([layout()['8-placed.json'].x, layout()['8-placed.json'].y], [8, 0]);
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
