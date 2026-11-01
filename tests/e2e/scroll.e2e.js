import assert from 'node:assert/strict';
import {test} from 'node:test';

import {board, drive, errors, layout, notes, rect, removeNote, sleep, writeNote} from './shell.js';

const wheel = (direction, times = 1) => drive(
    `for (let i = 0; i < ${times}; i++) { driver.scroll(Clutter.ScrollDirection.${direction}); await driver.wait(30); }`);
const scrolled = () => board('b._scroll');
const onScreen = id => board(`(a => a.get_transformed_position()[1])(b._cards.get('${id}').actor)`);
const LONG = {title: 'Long', items: Array.from({length: 60}, (_, i) => `line number ${i}`), grid: {x: 0, y: 0, w: 2}};

test('notes that fit on the screen do not scroll', async () => {
    const r = rect('2-thesis.json');
    await drive(`driver.move(${r.x + 150}, ${r.y + 20}); await driver.wait(100);`);
    await wheel('DOWN', 3);
    assert.equal(scrolled(), 0);
    assert.equal(board('b._more.visible'), false);
});

test('a note taller than the screen brings up the way down', async () => {
    writeNote('long.json', LONG);
    await sleep(600);
    assert.ok(board('b._maxScroll()') > 0);
    assert.equal(board('b._more.visible'), true);
    assert.equal(board('b._more.opacity'), 255);
    assert.equal(board('b._more.child.icon_name'), 'pan-down-symbolic');
});

test('the wheel over a card scrolls, without saving anything', async () => {
    const before = JSON.stringify(notes());
    const r = rect('long.json');
    await drive(`driver.move(${r.x + 150}, ${r.y + 40}); await driver.wait(100);`);
    await wheel('DOWN', 2);
    await sleep(300);
    const by = scrolled();
    assert.equal(by, 144, 'each notch counted once');
    assert.equal(onScreen('long.json'), r.y - by);
    assert.equal(JSON.stringify(notes()), before);
    await wheel('UP', 2);
    await sleep(300);
    assert.equal(scrolled(), 0);
});

test('scrolling moves the hover along with the cards', async () => {
    writeNote('2-thesis.json', {title: 'Thesis', items: ['a'], grid: {x: 0, y: 0, w: 2}});
    writeNote('long.json', {...LONG, grid: {x: 2, y: 0, w: 2}});
    writeNote('below.json', {title: 'Below', items: Array.from({length: 40}, (_, i) => `line ${i}`), grid: {x: 0, y: 8, w: 2}});
    await sleep(600);
    const top = rect('2-thesis.json');
    const px = top.x + 150;
    await drive(`driver.move(${px}, ${top.y + 30}); await driver.wait(150);`);
    assert.equal(board(`b._cards.get('2-thesis.json').actor.hover`), true);
    const hit = board(`b._cards.get('below.json').actor.y`);
    await drive(`for (let i = 0; i < ${Math.ceil((hit - top.y) / 72) + 1}; i++) { driver.scroll(Clutter.ScrollDirection.DOWN); await driver.wait(30); }`);
    await sleep(500);
    assert.equal(board(`b._cards.get('2-thesis.json').actor.hover`), false, 'no longer under the pointer');
    assert.equal(board(`b._cards.get('below.json').actor.hover`), true, 'now under the pointer');
    await wheel('UP', 60);
    await sleep(300);
    removeNote('below.json');
    await sleep(500);
});

test('it stops at both ends', async () => {
    await wheel('UP', 3);
    assert.equal(scrolled(), 0);
    await wheel('DOWN', 60);
    await sleep(300);
    assert.equal(scrolled(), board('b._maxScroll()'));
    assert.equal(board('b._more.child.icon_name'), 'pan-up-symbolic');
});

test('from the end, the button goes back up', async () => {
    const [x, y] = board('(m => [m.x + 18, m.y + 18])(b._more)');
    await drive(`await driver.click(${x}, ${y});`);
    await sleep(300);
    assert.equal(scrolled(), 0);
});

test('the bottom corner of a very tall note can be reached to resize it', async () => {
    await wheel('DOWN', 60);
    await sleep(300);
    const r = rect('long.json');
    const bottom = r.y + r.height - scrolled();
    assert.ok(bottom < board('global.stage.height'), 'on screen');
    const x = r.x + 4;
    const before = layout()['long.json'].w;
    await drive(`await driver.drag(${x}, ${bottom - 4}, ${x - 330}, ${bottom - 4});`);
    await sleep(500);
    assert.notEqual(layout()['long.json'].w, before, 'the grip answered');
    assert.equal(board('b._gesture'), null);
});

test('a card dragged while scrolled lands where it was dropped', async () => {
    const id = '4-studio.json';
    // The pointer was left over empty desktop, which keeps its own wheel events.
    board('b._scrollTo(72, false)');
    await sleep(100);
    const before = layout()[id];
    const r = rect(id);
    // Well clear of the top bar, which the top of the board now sits under.
    const y = r.y - scrolled() + 80;
    await drive(`await driver.drag(${r.x + 150}, ${y}, ${r.x + 150 - 318}, ${y});`);
    await sleep(600);
    assert.notEqual(layout()[id].x, before.x);
    assert.equal(rect(id).y % 1, 0);
    const {y: py} = rect(id);
    assert.equal(py, 72 + layout()[id].y * 36, 'on the grid, with no scroll left in it');
});

test('a new note below the fold is brought into view to write in', async () => {
    for (let i = 0; i < 12; i++)
        writeNote(`tall-${i}.json`, {...LONG, title: `Tall ${i}`, grid: {x: i, y: 0, w: 1}});
    await sleep(800);
    board('b._scrollTo(0, false)');
    await sleep(100);
    board('b.newNote()');
    await sleep(500);
    const id = board('b._composer.card.file');
    const top = onScreen(id);
    const height = rect(id).height;
    assert.ok(rect(id).y > board('global.stage.height'), 'it starts past the bottom of the screen');
    assert.ok(top >= 0 && top + height <= board('global.stage.height'), `in view at ${top}`);
    await drive('await driver.tap(Clutter.KEY_Escape);');
    await sleep(400);
});

test('with the tall notes gone the board stops being scrollable', async () => {
    for (let i = 0; i < 12; i++)
        removeNote(`tall-${i}.json`);
    removeNote('long.json');
    await sleep(800);
    assert.equal(board('b._maxScroll()'), 0);
    assert.equal(scrolled(), 0);
    assert.equal(board('b._sheet.y'), 0);
    await sleep(300);
    assert.equal(board('b._more.visible'), false);
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
});
