import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, evaluate, layout, notes, rect, sleep, writeNote} from './shell.js';

const LAYOUT = layout();

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
    assert.equal(layout()['1-launch.json'], undefined);
    assert.ok(layout()['5-website.json'].y < before['5-website.json'].y);
    assert.equal(board(`b._sheet.get_children().filter(c => c.style_class === 'grid-notes-card').length`), 6);
});

test('its file stays put while it can still be undone', () => {
    assert.ok(notes()['1-launch.json']);
    assert.equal(board('b._toast.visible'), true);
    assert.equal(board('b._toast.opacity'), 255);
    const toast = board('(t => ({x: t.x, y: t.y, width: t.width, height: t.height}))(b._toast)');
    for (const id of Object.keys(layout())) {
        const r = rect(id);
        const apart = toast.x + toast.width <= r.x || r.x + r.width <= toast.x ||
            toast.y + toast.height <= r.y || r.y + r.height <= toast.y;
        assert.ok(apart, `the message leaves ${id} readable`);
    }
});

test('nothing brings a deleted note back by itself in the meantime', async () => {
    writeNote('1-launch.json', {...notes()['1-launch.json'], next: 'touched by a script'});
    await sleep(500);
    assert.equal(layout()['1-launch.json'], undefined);
});

test('undo brings it back to the same place, with its neighbours where they were', async () => {
    const [x, y] = board('(t => { const [px, py] = t.get_transformed_position(); return [px + t.width - 30, py + t.height / 2]; })(b._toast)');
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(600);
    assert.deepEqual(layout(), LAYOUT, 'as it was before deleting');
    assert.equal(board(`b._cards.get('1-launch.json').actor.opacity`), 255);
    assert.equal(notes()['1-launch.json'].next, 'touched by a script', 'with what the file says now');
    assert.equal(board('b._undo'), null);
    await sleep(300);
    assert.equal(board('b._toast.visible'), false);
});

test('undoing leaves no timer that deletes it later', async () => {
    await sleep(100);
    assert.ok(notes()['1-launch.json']);
    assert.equal(board('b._undo'), null);
});

const deleteNote = async file => {
    const [x, y] = closeOf(rect(file));
    await drive(`await driver.click(${x}, ${y}); await driver.wait(100); await driver.click(${x}, ${y});`);
    await sleep(300);
};

test('deleting another note finishes the first one right away', async () => {
    await deleteNote('1-launch.json');
    assert.ok(notes()['1-launch.json']);
    await deleteNote('2-thesis.json');
    assert.equal(notes()['1-launch.json'], undefined);
    assert.ok(notes()['2-thesis.json']);
});

test('without an undo, the note goes to the trash when the time is up', async () => {
    await sleep(8400);
    assert.equal(notes()['2-thesis.json'], undefined);
    assert.equal(layout()['2-thesis.json'], undefined);
    assert.equal(board('b._toast.visible'), false);
    assert.equal(board('b._undo'), null);
});

test('a pending delete still happens if the extension goes away', async () => {
    await deleteNote('3-synth.json');
    assert.ok(notes()['3-synth.json']);
    evaluate(`Main.extensionManager.disableExtension('grid-notes@desktop'); 0`);
    await sleep(400);
    assert.equal(notes()['3-synth.json'], undefined);
    evaluate(`Main.extensionManager.enableExtension('grid-notes@desktop'); 0`);
    await sleep(800);
});

test('deleting does not start a drag', () => {
    assert.equal(board('b._gesture'), null);
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
