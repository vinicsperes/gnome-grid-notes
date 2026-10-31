import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, layout, notes, rect, sleep} from './shell.js';

const closeOf = r => [r.x + r.width - 18, r.y + 18];

test('one click only asks, and the note stays', async () => {
    const [x, y] = closeOf(rect('7-trip.json'));
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(100);
    assert.equal(board(`b._cards.get('7-trip.json').close.label !== '×'`), true);
    assert.ok(notes()['7-trip.json']);
});

test('the question goes away by itself', async () => {
    await sleep(2800);
    assert.equal(board(`b._cards.get('7-trip.json').close.label`), '×');
    assert.ok(notes()['7-trip.json']);
});

test('moving away cancels it too', async () => {
    const [x, y] = closeOf(rect('7-trip.json'));
    await drive(`await driver.click(${x}, ${y}); driver.move(100, 900); await driver.wait(150);`);
    assert.equal(board(`b._cards.get('7-trip.json').close.label`), '×');
});

test('a second click deletes the note and the rest close the gap', async () => {
    const [x, y] = closeOf(rect('1-launch.json'));
    const before = layout();
    await drive(`await driver.click(${x}, ${y}); await driver.wait(100); await driver.click(${x}, ${y});`);
    await sleep(600);
    assert.equal(notes()['1-launch.json'], undefined);
    assert.equal(layout()['1-launch.json'], undefined);
    assert.ok(layout()['5-website.json'].y < before['5-website.json'].y);
    assert.equal(board(`b.layer.get_children().filter(c => c.style_class === 'mural-card').length`), 6);
});

test('deleting does not start a drag', () => {
    assert.equal(board('b._gesture'), null);
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
