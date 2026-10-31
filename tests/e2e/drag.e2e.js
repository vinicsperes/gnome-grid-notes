import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, layout, notes, rect, sleep} from './shell.js';

const center = r => [r.x + r.width / 2, r.y + 30];

test('the cards start out on the grid without overlapping', () => {
    const items = Object.values(layout());
    assert.equal(items.length, 7);
    assert.ok(items.every(i => i.w === 2));
});

test('a press without moving does nothing', async () => {
    const before = layout();
    const [x, y] = center(rect('2-thesis.json'));
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(300);
    assert.deepEqual(layout(), before);
    assert.equal(board('b._gesture'), null);
});

test('dragging a card shows the grid and a landing slot', async () => {
    const r = rect('1-launch.json');
    const [x, y] = center(r);
    await drive(`driver.move(${x}, ${y}); await driver.wait(80); driver.press(); await driver.wait(40);
        for (let i = 1; i <= 10; i++) { driver.move(${x} + i * 8, ${y} + i * 2); await driver.wait(16); }`);
    await sleep(250);
    assert.equal(board('b._dots.visible && b._ghost.visible'), true);
    assert.equal(board("b._gesture.lifted"), true);
    await drive('driver.release();');
    await sleep(500);
    assert.equal(board('b._gesture'), null);
    assert.equal(board('b._ghost.visible'), false);
});

test('dropping on a neighbour takes its place and saves the result', async () => {
    const before = layout();
    const from = rect('1-launch.json');
    const to = rect('4-studio.json');
    assert.equal(before['4-studio.json'].y, 0);
    const [x, y] = center(from);
    await drive(`await driver.drag(${x}, ${y}, ${x + to.x - from.x}, ${y + to.y - from.y});`);
    await sleep(600);

    const after = layout();
    assert.equal(after['1-launch.json'].x, before['4-studio.json'].x);
    assert.equal(after['1-launch.json'].y, 0);
    assert.ok(after['4-studio.json'].y >= after['1-launch.json'].h);

    const landed = rect('1-launch.json');
    assert.equal(landed.x, to.x, 'snapped to the column');
    assert.equal(landed.y, to.y, 'snapped to the row');

    const saved = notes()['1-launch.json'];
    assert.equal(saved.grid.x, after['1-launch.json'].x);
    assert.equal(saved.grid.y, after['1-launch.json'].y);
    assert.equal(saved.title, 'Launch', 'contents untouched');
});

test('a card dropped off the screen comes back onto the grid', async () => {
    const r = rect('6-cli.json');
    const [x, y] = center(r);
    await drive(`await driver.drag(${x}, ${y}, 1910, 1070);`);
    await sleep(600);
    const landed = rect('6-cli.json');
    assert.ok(landed.x + landed.width <= 1880);
    assert.ok(landed.y < 1000);
});

test('a card can sit in a new column by the left of the others', async () => {
    const r = rect('7-trip.json');
    const [x, y] = center(r);
    await drive(`await driver.drag(${x}, ${y}, 300, 120);`);
    await sleep(600);
    const landed = rect('7-trip.json');
    assert.ok(landed.x < 400);
    assert.equal(landed.y, 72, 'floated to the top');
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
