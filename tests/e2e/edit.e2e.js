import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {board, drive, errors, rect, sleep} from './shell.js';

const FILE = '6-cli.json';
const card = `b._cards.get('${FILE}')`;
const opacities = () => board('[...b._cards.values()].map(c => [c.file, c.actor.opacity])');

// Watches every card for a while after `action` runs.
async function watch(action, ms = 900) {
    await action();
    const seen = [];
    for (const end = Date.now() + ms; Date.now() < end; await sleep(25))
        seen.push(Object.fromEntries(opacities()));
    return seen;
}

test('a card fading in never blinks out on the way', async () => {
    const seen = await watch(() => board(`${card}.appear(0)`), 700);
    const values = seen.map(s => s[FILE]);
    assert.equal(values.at(-1), 255);
    values.reduce((previous, value) => {
        assert.ok(value >= previous, `opacity fell from ${previous} to ${value}: ${values}`);
        return value;
    });
});

// Which cards a small window ended up over, and which it left clear.
function overlap() {
    const [fx, fy, fw, fh] = board('(f => [f.x, f.y, f.width, f.height])' +
        '(global.get_window_actors()[0].meta_window.get_frame_rect())');
    const files = board('[...b._cards.keys()]');
    const covered = file => {
        const r = rect(file);
        return r.x < fx + fw && fx < r.x + r.width && r.y < fy + fh && fy < r.y + r.height;
    };
    return {covered: files.filter(covered), clear: files.filter(file => !covered(file))};
}

test('double clicking a note leaves it and any uncovered note still', async () => {
    spawn('gjs', ['-m', fileURLToPath(new URL('window.js', import.meta.url))], {
        env: {...process.env, WAYLAND_DISPLAY: 'mural-0', GDK_BACKEND: 'wayland', MURAL_WINDOW: '500x300'},
        stdio: 'ignore',
        detached: true,
    }).unref();
    for (let i = 0; i < 60 && !board('global.get_window_actors().length'); i++)
        await sleep(250);
    await sleep(800);

    const {covered, clear} = overlap();
    assert.ok(covered.length > 0 && clear.length > 1, `covered ${covered}, clear ${clear}`);
    const target = clear[0];
    const held = `b._cards.get('${target}')`;
    const r = rect(target);
    const rowY = () => board(`${held}.body.get_children().map(row => row.get_transformed_position()[1])`);
    const before = rowY();

    const seen = await watch(() => drive(`await driver.click(${r.x + 150}, ${r.y + 20}, 2);`));
    assert.equal(board('b._composer !== null'), true);
    for (const file of clear)
        assert.ok(seen.every(s => s[file] === 255), `${file} kept still`);

    assert.equal(rect(target).height, r.height, 'same height');
    assert.deepEqual(rowY(), before, 'the text stayed where it was');
    assert.equal(board(`${held}.body.get_child_at_index(0).get_n_children()`), 2, 'date still shown');
    board('b._composer.finish()');
    await sleep(400);
});

test('a note under a window still fades in when brought forward', async () => {
    const {covered, clear} = overlap();
    const seen = await watch(() => board('b.toggleFocus()'));
    for (const file of covered) {
        assert.ok(seen.some(s => s[file] < 255), `${file} faded in`);
        assert.equal(seen.at(-1)[file], 255);
    }
    for (const file of clear)
        assert.ok(seen.every(s => s[file] === 255), `${file} kept still`);
    board('b.toggleFocus()');
    await sleep(300);
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
});
