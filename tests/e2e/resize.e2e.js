import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, evaluate, layout, notes, rect, sleep} from './shell.js';

const corner = r => [r.x + r.width - 3, r.y + r.height - 3];

test('the grip is under the pointer at the bottom right corner', () => {
    const [x, y] = corner(rect('1-launch.json'));
    const style = board(`global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ${x}, ${y}).style_class`);
    assert.equal(style, 'mural-grip');
});

test('pulling the right grip widens the card by whole columns', async () => {
    const r = rect('2-thesis.json');
    const [x, y] = corner(r);
    const before = layout()['2-thesis.json'];
    await drive(`await driver.drag(${x}, ${y}, ${x + 165}, ${y});`);
    await sleep(500);
    const after = layout()['2-thesis.json'];
    assert.equal(after.w, before.w + 1);
    assert.equal(rect('2-thesis.json').width, r.width + 159);
    assert.equal(rect('2-thesis.json').x, r.x, 'left edge stays put');
    assert.equal(notes()['2-thesis.json'].grid.w, after.w);
});

test('a card against the screen edge grows with the left grip', async () => {
    const r = rect('4-studio.json');
    const before = layout()['4-studio.json'];
    assert.equal(before.x, 0);
    const [x, y] = [r.x + 3, r.y + r.height - 3];
    await drive(`await driver.drag(${x}, ${y}, ${x - 165}, ${y});`);
    await sleep(500);
    const after = layout()['4-studio.json'];
    assert.equal(after.w, before.w + 1);
    assert.equal(after.x, 0);
    assert.equal(rect('4-studio.json').x + rect('4-studio.json').width, r.x + r.width, 'right edge stays put');
});

test('pulling the grip down makes the card taller and pushes what is below', async () => {
    const r = rect('1-launch.json');
    const [x, y] = corner(r);
    const before = layout();
    await drive(`await driver.drag(${x}, ${y}, ${x}, ${y + 180});`);
    await sleep(500);
    const after = layout();
    assert.equal(after['1-launch.json'].h, before['1-launch.json'].h + 5);
    assert.equal(notes()['1-launch.json'].grid.h, after['1-launch.json'].h);
    assert.ok(after['5-website.json'].y > before['5-website.json'].y);
});

test('a card can never get shorter than its contents', async () => {
    const r = rect('3-synth.json');
    const [x, y] = corner(r);
    const before = layout()['3-synth.json'];
    await drive(`await driver.drag(${x}, ${y}, ${x}, ${y - 250});`);
    await sleep(500);
    assert.equal(layout()['3-synth.json'].h, before.h);
    assert.equal(notes()['3-synth.json'].grid.h, undefined, 'no custom height saved');
});

test('a card can never get narrower than the minimum', async () => {
    const r = rect('7-trip.json');
    const [x, y] = corner(r);
    await drive(`await driver.drag(${x}, ${y}, ${x - 280}, ${y});`);
    await sleep(500);
    assert.equal(layout()['7-trip.json'].w, 2);
});

test('the add button comes back after a resize', async () => {
    assert.equal(board('b._add.opacity'), 255);
    assert.equal(board('b._add.reactive'), true);
});

test('losing room to a dock moves the cards out of its way', async () => {
    const before = rect('2-thesis.json').x;
    evaluate(`Main.layoutManager.getWorkAreaForMonitor = () =>
        ({x: 0, y: 32, width: 1500, height: 1048}); global.display.emit('workareas-changed'); 0`);
    await sleep(500);
    assert.ok(rect('2-thesis.json').x < before);
    evaluate('delete Main.layoutManager.getWorkAreaForMonitor; 0');
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
