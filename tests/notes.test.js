import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    daysSince, fileNameFor, isBlank, isoDay, parseNote, serializeNote,
} from '../extension/lib/notes.js';

test('reads a complete note', () => {
    const note = parseNote(JSON.stringify({
        title: 'Mural', date: '2026-10-29', items: ['a', 'b'], next: 'c',
        grid: {x: 2, y: 4, w: 3, h: 9},
    }));
    assert.equal(note.title, 'Mural');
    assert.deepEqual(note.items, ['a', 'b']);
    assert.equal(note.next, 'c');
    assert.deepEqual(note.grid, {x: 2, y: 4, w: 3, h: 9});
});

test('reads the original Portuguese field names', () => {
    const note = parseNote(JSON.stringify({
        titulo: 'projeto', data: '2026-10-29', itens: ['um'], proximo: 'dois',
    }));
    assert.equal(note.title, 'projeto');
    assert.equal(note.date, '2026-10-29');
    assert.deepEqual(note.items, ['um']);
    assert.equal(note.next, 'dois');
});

test('a minimal note gets sensible defaults', () => {
    const note = parseNote('{}');
    assert.deepEqual([note.title, note.date, note.items, note.next, note.grid],
        ['', '', [], '', null]);
});

test('odd values are coerced instead of breaking the card', () => {
    const note = parseNote(JSON.stringify({title: 7, items: [1, 'x'], next: 0}));
    assert.equal(note.title, '7');
    assert.deepEqual(note.items, ['1', 'x']);
    assert.equal(note.next, '');
});

test('rejects files that are not notes', () => {
    assert.throws(() => parseNote('[1, 2]'));
    assert.throws(() => parseNote('null'));
    assert.throws(() => parseNote('{ not json'));
});

test('ignores a grid position that makes no sense', () => {
    for (const grid of [{x: -1, y: 0, w: 2}, {x: 0, y: 0, w: 0}, {x: 'a', y: 0, w: 2}, 'nope'])
        assert.equal(parseNote(JSON.stringify({grid})).grid, null);
    assert.deepEqual(parseNote(JSON.stringify({grid: {x: 0, y: 0, w: 2, h: 0}})).grid,
        {x: 0, y: 0, w: 2});
});

test('saving keeps fields from other tools', () => {
    const note = parseNote(JSON.stringify({title: 'a', items: [], color: 'red'}));
    const saved = JSON.parse(serializeNote(note));
    assert.equal(saved.color, 'red');
});

test('saving writes the current field names', () => {
    const saved = JSON.parse(serializeNote(parseNote('{"titulo": "a", "itens": ["b"]}')));
    assert.deepEqual(saved, {title: 'a', items: ['b']});
});

test('a note survives a save and reload', () => {
    const text = serializeNote(parseNote(JSON.stringify({
        title: 'a', date: '2026-01-02', items: ['b'], next: 'c', grid: {x: 1, y: 2, w: 3},
    })));
    assert.equal(serializeNote(parseNote(text)), text);
});

test('isBlank ignores whitespace', () => {
    assert.ok(isBlank(parseNote('{"title": "  ", "items": ["", " "]}')));
    assert.ok(!isBlank(parseNote('{"items": ["x"]}')));
    assert.ok(!isBlank(parseNote('{"next": "x"}')));
});

test('file names are readable and unique', () => {
    assert.equal(fileNameFor('Estúdio de Gravação!', []), 'estudio-de-gravacao.json');
    assert.equal(fileNameFor('a', ['a.json', 'a-2.json']), 'a-3.json');
    assert.equal(fileNameFor('', []), 'note.json');
    assert.equal(fileNameFor('!!!', []), 'note.json');
    assert.ok(fileNameFor('x'.repeat(200), []).length <= 45);
});

test('daysSince counts calendar days', () => {
    const today = new Date(2026, 9, 31, 23, 50);
    assert.equal(daysSince('2026-10-31', today), 0);
    assert.equal(daysSince('2026-10-30', today), 1);
    assert.equal(daysSince('2026-10-01', today), 30);
    assert.equal(daysSince('2026-11-02', today), -2);
    assert.equal(daysSince('someday', today), null);
});

test('isoDay pads months and days', () => {
    assert.equal(isoDay(new Date(2026, 0, 5)), '2026-01-05');
});
