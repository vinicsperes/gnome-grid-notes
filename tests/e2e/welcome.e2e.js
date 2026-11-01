import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';

import {board, errors, evaluate, layout, notes, sleep} from './shell.js';

const STATE = "Main.extensionManager.lookup('grid-notes@desktop').stateObj._board._settings";
const cycle = async () => {
    evaluate(`Main.extensionManager.disableExtension('grid-notes@desktop'); 0`);
    await sleep(200);
    evaluate(`Main.extensionManager.enableExtension('grid-notes@desktop'); 0`);
    await sleep(700);
};
const clear = () => {
    for (const name of Object.keys(notes()))
        rmSync(join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes', name));
};

test('someone who already has notes gets no extra one', () => {
    assert.equal(evaluate(`${STATE}.get_boolean('welcomed')`), true);
    assert.equal(Object.keys(notes()).some(name => /welcome|bem-vindo/.test(name)), false);
});

test('someone starting with nothing gets a note showing how it works', async () => {
    clear();
    evaluate(`${STATE}.set_boolean('welcomed', false); 0`);
    await cycle();
    const all = Object.entries(notes());
    assert.equal(all.length, 1);
    const [[name, note]] = all;
    assert.ok(note.items.every(item => item.done === false), 'all checkboxes, none ticked');
    assert.ok(layout()[name], 'on the board');
    assert.equal(board(`[...b._cards.get(${JSON.stringify(name)})._checks.keys()].length`), note.items.length);
});

test('once deleted it does not come back', async () => {
    clear();
    await sleep(400);
    await cycle();
    assert.deepEqual(Object.keys(notes()), []);
    assert.deepEqual(layout(), {});
});

test('no errors in the shell', () => {
    assert.deepEqual(errors(), []);
});
