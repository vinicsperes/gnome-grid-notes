import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {board, drive, errors, evaluate, rect, sleep} from './shell.js';

const under = (x, y) => evaluate(
    `global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ${x}, ${y}).style_class ?? 'other'`);
const onTop = () => evaluate('global.window_group.get_children().at(-1).get_name()');

test('with no windows, a card is what the pointer finds', () => {
    const r = rect('2-thesis.json');
    assert.equal(under(r.x + 100, r.y + 60), 'grid-notes-card');
});

test('an open window covers the cards and gets the clicks', async () => {
    spawn('gjs', ['-m', fileURLToPath(new URL('window.js', import.meta.url))], {
        env: {...process.env, WAYLAND_DISPLAY: 'grid-notes-0', GDK_BACKEND: 'wayland'},
        stdio: 'ignore',
        detached: true,
    }).unref();
    for (let i = 0; i < 60 && !board('global.get_window_actors().length'); i++)
        await sleep(250);
    await sleep(800);
    assert.ok(board('global.get_window_actors().length') > 0, 'window opened');
    const r = rect('2-thesis.json');
    assert.notEqual(under(r.x + 100, r.y + 60), 'grid-notes-card');
    assert.notEqual(onTop(), 'grid-notes');
});

test('bringing notes forward puts them above the window', async () => {
    board('b.toggleFocus()');
    await sleep(800);
    assert.equal(onTop(), 'grid-notes');
    const r = rect('2-thesis.json');
    assert.equal(under(r.x + 100, r.y + 60), 'grid-notes-card');
    assert.equal(board(`b._cards.get('2-thesis.json').actor.opacity`), 255, 'faded in');
});

test('dragging works up there too, and the window waits', async () => {
    const r = rect('2-thesis.json');
    await drive(`await driver.drag(${r.x + 150}, ${r.y + 20}, 300, 100);`);
    await sleep(500);
    assert.ok(rect('2-thesis.json').x < 400);
});

test('escape sends them back behind the window', async () => {
    await drive('await driver.tap(Clutter.KEY_Escape);');
    await sleep(400);
    assert.equal(board('b._focus'), null);
    assert.notEqual(onTop(), 'grid-notes');
    const r = rect('3-synth.json');
    assert.notEqual(under(r.x + 100, r.y + 60), 'grid-notes-card');
});

test('restacking the windows keeps the cards below them', async () => {
    board('global.get_window_actors().at(-1).meta_window.lower()');
    await sleep(200);
    board('global.get_window_actors().at(-1).meta_window.raise()');
    await sleep(300);
    assert.notEqual(onTop(), 'grid-notes');
});

test('turning the extension off cleans up', async () => {
    evaluate("Main.extensionManager.lookup('grid-notes@desktop').stateObj.disable(); 0");
    await sleep(200);
    const names = evaluate('global.window_group.get_children().map(c => c.get_name())');
    assert.ok(!names.includes('grid-notes'));
    evaluate("Main.extensionManager.lookup('grid-notes@desktop').stateObj.enable(); 0");
    await sleep(600);
    const again = evaluate('global.window_group.get_children().map(c => c.get_name())');
    assert.ok(again.includes('grid-notes'));
});

test('nothing logged an error', () => {
    assert.deepEqual(errors(), []);
});
