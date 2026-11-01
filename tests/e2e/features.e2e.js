import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {test} from 'node:test';

import {board, drive, errors, evaluate, layout, notes, rect, screenshot, sleep, writeNote} from './shell.js';

const settings = "Main.extensionManager.lookup('grid-notes@desktop').stateObj._board._settings";
const hidden = () => evaluate(`${settings}.get_boolean('hidden')`);
const chord = key => drive(`await driver.tap(Clutter.KEY_${key}, Clutter.KEY_Control_L, Clutter.KEY_Alt_L);`);
const key = (name, ...mods) => drive(`await driver.tap(Clutter.KEY_${name}${mods.map(m => `, Clutter.KEY_${m}`).join('')});`);
const type = text => drive(`await driver.type(${JSON.stringify(text)});`);
const gsettings = (command, name, ...value) => execFileSync('gsettings', [
    '--schemadir', `${process.env.GRID_NOTES_ROOT}/extension/schemas`,
    command, 'org.gnome.shell.extensions.grid-notes', name, ...value,
], {encoding: 'utf8'}).trim();
const open = async file => {
    const r = rect(file);
    await drive(`await driver.click(${r.x + 150}, ${r.y - board('b._scroll') + 6}, 2);`);
    await sleep(250);
};
const close = async () => {
    await key('Escape');
    await sleep(350);
};

test('the shortcut hides every note, and clicks go through to the desktop', async () => {
    const r = rect('2-thesis.json');
    await chord('h');
    await sleep(400);
    assert.equal(hidden(), true);
    assert.equal(board('b.layer.visible'), false);
    const under = evaluate(`(a => a.style_class ?? 'other')(global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, ${r.x + 100}, ${r.y + 60}))`);
    assert.notEqual(under, 'grid-notes-card');
});

test('hidden notes stay hidden when the screen locks and unlocks', async () => {
    evaluate(`Main.extensionManager.disableExtension('grid-notes@desktop'); 0`);
    await sleep(200);
    evaluate(`Main.extensionManager.enableExtension('grid-notes@desktop'); 0`);
    await sleep(600);
    assert.equal(board('b.layer.visible'), false);
});

test('files written meanwhile are there when they come back', async () => {
    writeNote('meanwhile.json', {title: 'Meanwhile'});
    await sleep(400);
    await chord('h');
    await sleep(400);
    assert.equal(hidden(), false);
    assert.equal(board('b.layer.visible'), true);
    assert.equal(board('b.layer.opacity'), 255);
    assert.ok(layout()['meanwhile.json']);
});

test('asking for a new note brings them back', async () => {
    await chord('h');
    await sleep(400);
    await chord('n');
    await sleep(300);
    assert.equal(hidden(), false);
    assert.equal(board('b.layer.visible'), true);
    assert.equal(board('b._composer !== null'), true);
    await close();
});

test('hiding keeps what was being written and finishes a pending delete', async () => {
    board('b.newNote()');
    await sleep(200);
    await type('Kept');
    await chord('h');
    await sleep(400);
    assert.equal(board('b._composer'), null);
    assert.equal(board('b._focus'), null);
    assert.equal(notes()['kept.json'].title, 'Kept');
    await chord('h');
    await sleep(400);
});

test('moving a line with alt and the arrows', async () => {
    writeNote('list.json', {title: 'List', items: ['one', {text: 'two', done: true}, 'three'], grid: {x: 12, y: 0, w: 2}});
    await sleep(400);
    await open('list.json');
    const items = () => board('b._composer.values().items');
    const before = board('b._composer._rows[2].entry.clutter_text === global.stage.get_key_focus()');
    assert.equal(before, true, 'starts on the last line');
    await key('Up', 'Alt_L');
    assert.deepEqual(items(), ['one', 'three', {text: 'two', done: true}]);
    await key('Up', 'Alt_L');
    assert.deepEqual(items(), ['three', 'one', {text: 'two', done: true}]);
    await key('Up', 'Alt_L');
    assert.deepEqual(items(), ['three', 'one', {text: 'two', done: true}], 'stops at the top');
    await key('Down', 'Alt_L');
    assert.deepEqual(items(), ['one', 'three', {text: 'two', done: true}]);
    await type('!');
    assert.deepEqual(items(), ['one', 'three!', {text: 'two', done: true}], 'the caret goes with the line');
    const rows = board('b._composer.card.body.get_children().map(c => c.style_class)');
    assert.equal(rows[0], 'grid-notes-head');
    await close();
    assert.deepEqual(notes()['list.json'].items, ['one', 'three!', {text: 'two', done: true}]);
});

test('up and down move inside text that wraps before leaving it', async () => {
    const long = 'a line of text long enough that it wraps around and takes more than one line in the card, for sure';
    writeNote('list.json', {title: 'List', items: ['short', long, 'after'], grid: {x: 12, y: 0, w: 2}});
    await sleep(400);
    await open('list.json');
    const focus = () => board(`b._composer._fields().findIndex(e => e.clutter_text === global.stage.get_key_focus())`);
    await key('Up');
    assert.equal(focus(), 2, 'on the long line, from the one below');
    assert.ok(board('b._composer._rows[1].entry.clutter_text.get_layout().get_line_count()') > 1);
    await key('Up');
    assert.equal(focus(), 2, 'still on it, one wrapped line up');
    await key('Up');
    assert.equal(focus(), 2, 'now on its first line');
    await key('Up');
    assert.equal(focus(), 1, 'and only past that does it leave');
    await close();
});

test('a card held at the edge of the screen scrolls the board', async () => {
    writeNote('tall.json', {title: 'Tall', items: Array.from({length: 70}, (_, i) => `line ${i}`), grid: {x: 0, y: 0, w: 2}});
    await sleep(500);
    const id = '3-synth.json';
    const r = rect(id);
    const bottom = board('(a => a.y + a.height)(Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex))');
    await drive(`driver.move(${r.x + 150}, ${r.y + 14}); await driver.wait(60); driver.press(); await driver.wait(40);
        for (let i = 1; i <= 20; i++) { driver.move(${r.x + 150}, ${r.y + 14} + (${bottom - 6} - ${r.y + 14}) * i / 20); await driver.wait(12); }`);
    await sleep(700);
    const scrolled = board('b._scroll');
    assert.ok(scrolled > 100, `scrolled ${scrolled}`);
    // Its own position, since being lifted also scales it up a little.
    const held = board(`b._cards.get('${id}').actor.y - b._scroll`);
    assert.ok(Math.abs(held - (bottom - 6 - 14)) < 3, `still under the pointer, at ${held}`);
    await drive('driver.release(); await driver.wait(60);');
    await sleep(600);
    assert.equal(board('b._gesture'), null);
    assert.ok(layout()[id].y > 3, 'dropped further down than it could have reached');
    const again = board('b._scroll');
    await sleep(300);
    assert.equal(board('b._scroll'), again, 'and it stops scrolling when let go');
});

test('away from the edge, a dragged card leaves the board where it is', async () => {
    board('b._scrollTo(300, false)');
    const r = rect('tall.json');
    await drive(`driver.move(${r.x + 150}, 500); await driver.wait(60); driver.press(); await driver.wait(40);
        for (let i = 1; i <= 10; i++) { driver.move(${r.x + 150}, 500 + 6 * i); await driver.wait(12); }`);
    await sleep(300);
    assert.equal(board('b._scroll'), 300);
    await drive('driver.release(); await driver.wait(60);');
    await sleep(400);
});

test('hiding from outside waits for a card in the hand to land', async () => {
    const r = rect('tall.json');
    await drive(`driver.move(${r.x + 150}, 500); await driver.wait(60); driver.press(); await driver.wait(40); driver.move(${r.x + 150}, 540); await driver.wait(60);`);
    assert.notEqual(board('b._gesture'), null);
    gsettings('set', 'hidden', 'true');
    await sleep(300);
    assert.equal(board('b.layer.visible'), true, 'not while being held');
    await drive('driver.release(); await driver.wait(60);');
    await sleep(500);
    assert.equal(board('b._gesture'), null);
    assert.equal(board('b.layer.visible'), false, 'as soon as it lands');
    gsettings('set', 'hidden', 'false');
    await sleep(400);
    assert.equal(board('b.layer.visible'), true);
});

test('the preferences window opens', async () => {
    const env = {...process.env, WAYLAND_DISPLAY: 'grid-notes-0', GDK_BACKEND: 'wayland'};
    spawn('gnome-extensions', ['prefs', 'grid-notes@desktop'], {env, stdio: 'ignore', detached: true}).unref();
    const windows = () => board('global.get_window_actors().map(a => a.meta_window.get_title())');
    for (let i = 0; i < 60 && !windows().length; i++)
        await sleep(250);
    await sleep(1500);
    assert.deepEqual(windows(), ['Grid Notes']);
    if (process.env.GRID_NOTES_SHOT)
        screenshot(process.env.GRID_NOTES_SHOT);
});

// Where the first shortcut's button sits in the window, as laid out by the toolkit.
const changeButton = () => {
    const [x, y] = board('(f => [f.x, f.y])(global.get_window_actors()[0].meta_window.get_frame_rect())');
    return [x + 528, y + 174];
};

test('a shortcut changed there works right away', async () => {
    const [x, y] = changeButton();
    await drive(`await driver.click(${x}, ${y}); await driver.wait(200);`);
    await chord('j');
    await sleep(300);
    assert.match(gsettings('get', 'new-note'), /<(Control|Primary)><Alt>j/);
    await chord('j');
    await sleep(400);
    assert.equal(board('b._composer !== null'), true, 'the new one opens a note');
    await key('Escape');
    await sleep(400);
    await chord('n');
    await sleep(300);
    assert.equal(board('b._composer'), null, 'the old one no longer does');
});

test('a plain letter is not accepted, and Esc leaves things as they were', async () => {
    const [x, y] = changeButton();
    await drive(`await driver.click(${x}, ${y}); await driver.wait(200);`);
    await key('q');
    await sleep(200);
    assert.match(gsettings('get', 'new-note'), /<Alt>j/);
    await key('Escape');
    await sleep(200);
    assert.match(gsettings('get', 'new-note'), /<Alt>j/);
});

test('Backspace turns a shortcut off', async () => {
    const [x, y] = changeButton();
    await drive(`await driver.click(${x}, ${y}); await driver.wait(200);`);
    await key('BackSpace');
    await sleep(300);
    assert.match(gsettings('get', 'new-note'), /\[\]/);
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
});
