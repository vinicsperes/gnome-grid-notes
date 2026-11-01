import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
    daysSince, emptyNote, fileNameFor, isBlank, isoDay, itemDone, itemText, makeItem, parseNote,
    withContent, withDone, withGrid,
} from '../extension/lib/notes.js';

test('reads a complete note', () => {
    const note = parseNote(JSON.stringify({
        title: 'Grid Notes', date: '2026-10-29', items: ['a', 'b'], next: 'c',
        grid: {x: 2, y: 4, w: 3, h: 9},
    }));
    assert.equal(note.title, 'Grid Notes');
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

test('odd values are shown instead of dropped', () => {
    const note = parseNote(JSON.stringify({title: 7, items: [1, 'x', {a: 1}], next: 0}));
    assert.equal(note.title, '7');
    assert.deepEqual(note.items, ['1', 'x', '{"a":1}']);
    assert.equal(note.next, '0');
    assert.deepEqual(parseNote('{"items": "buy milk"}').items, ['buy milk']);
});

test('reads checkboxes next to plain bullets', () => {
    const {items} = parseNote(JSON.stringify({items: [
        'plain', {text: 'open', done: false}, {text: 'closed', done: true, due: 'friday'},
    ]}));
    assert.deepEqual(items.map(itemText), ['plain', 'open', 'closed']);
    assert.deepEqual(items.map(itemDone), [null, false, true]);
});

test('an object that only looks like a checkbox is shown as it is', () => {
    const {items} = parseNote(JSON.stringify({items: [{text: 'x'}, {done: true}, {text: 1, done: true}]}));
    assert.deepEqual(items, ['{"text":"x"}', '{"done":true}', '{"text":1,"done":true}']);
});

test('makeItem writes plain bullets as plain text', () => {
    assert.equal(makeItem('a', null), 'a');
    assert.deepEqual(makeItem('a', false), {text: 'a', done: false});
    assert.deepEqual(makeItem('a', true), {text: 'a', done: true});
});

test('ticking a checkbox changes only that checkbox', () => {
    const original = {
        titulo: 'a', color: 'red', grid: {x: 1, y: 2, w: 3},
        itens: ['plain', {text: 'b', done: false, due: 'friday'}, {text: 'c', done: false}],
    };
    const saved = JSON.parse(withDone(JSON.stringify(original), 1, 'b', true));
    assert.deepEqual(saved, {
        ...original,
        itens: ['plain', {text: 'b', done: true, due: 'friday'}, {text: 'c', done: false}],
    });
    assert.deepEqual(Object.keys(saved), Object.keys(original));
});

test('ticking does nothing when the file no longer has that line', () => {
    const text = JSON.stringify({items: ['plain', {text: 'b', done: false}]});
    assert.equal(withDone(text, 0, 'plain', true), text, 'a plain bullet');
    assert.equal(withDone(text, 1, 'moved', true), text, 'different text');
    assert.equal(withDone(text, 5, 'b', true), text, 'gone');
    assert.equal(withDone(text, 1, 'b', false), text, 'already that way');
    assert.equal(withDone('{"items": "b"}', 0, 'b', true), '{"items": "b"}', 'not a list');
    assert.throws(() => withDone('{ not json', 0, 'b', true));
});

test('checkboxes survive an edit of other fields and count as content', () => {
    const text = JSON.stringify({items: [{text: 'b', done: true}]});
    assert.deepEqual(JSON.parse(withContent(text, {title: 'c'})).items, [{text: 'b', done: true}]);
    assert.ok(!isBlank(parseNote(text)));
    assert.ok(isBlank(parseNote(JSON.stringify({items: [{text: ' ', done: false}]}))));
});

test('field names from Object.prototype are just unknown fields', () => {
    const text = '{"constructor": "c", "toString": "t", "__proto__": {"title": "x"}, "items": []}';
    assert.equal(parseNote(text).title, '');
    const saved = withGrid(text, {x: 1, y: 2, w: 2});
    assert.equal(JSON.parse(saved).constructor, 'c');
    assert.equal(JSON.parse(saved).toString, 't');
});

test('rejects files that are not notes', () => {
    assert.throws(() => parseNote('[1, 2]'));
    assert.throws(() => parseNote('null'));
    assert.throws(() => parseNote('{ not json'));
});

test('ignores a grid position that makes no sense', () => {
    for (const grid of [{x: -1, y: 0, w: 2}, {x: 0, y: 0, w: 0}, {x: 'a', y: 0, w: 2}, 'nope'])
        assert.equal(parseNote(JSON.stringify({grid})).grid, null);
    assert.equal(parseNote('{"grid": {"x": 0, "y": 1e9, "w": 2}}').grid, null);
    assert.deepEqual(parseNote('{"grid": {"x": 0, "y": 0, "w": 2, "h": 1e9}}').grid,
        {x: 0, y: 0, w: 2});
    assert.deepEqual(parseNote(JSON.stringify({grid: {x: 0, y: 0, w: 2, h: 0}})).grid,
        {x: 0, y: 0, w: 2});
});

test('moving a note changes nothing but its position', () => {
    const original = {titulo: 'a', itens: [{text: 'x', done: true}], next: 0, color: 'red'};
    const saved = JSON.parse(withGrid(JSON.stringify(original), {x: 1, y: 2, w: 3}));
    assert.deepEqual(saved, {...original, grid: {x: 1, y: 2, w: 3}});
});

test('a note already in place keeps its exact text', () => {
    const text = '{ "title": "by hand",\n     "grid": {"x": 1, "y": 2, "w": 3} }';
    assert.equal(withGrid(text, {x: 1, y: 2, w: 3}), text);
});

test('moving a note whose file is broken throws instead of writing', () => {
    assert.throws(() => withGrid('{ not json', {x: 0, y: 0, w: 2}));
});

test('editing writes current field names and keeps other fields', () => {
    const text = '{"titulo": "a", "itens": ["b"], "color": "red", "grid": {"x": 1, "y": 2, "w": 3}}';
    const saved = JSON.parse(withContent(text, {title: 'c', date: '', items: ['d'], next: ''}));
    assert.deepEqual(saved, {title: 'c', items: ['d'], grid: {x: 1, y: 2, w: 3}, color: 'red'});
});

test('editing can update the position at the same time', () => {
    const saved = JSON.parse(withContent('{"grid": {"x": 1, "y": 2, "w": 3}}',
        {title: 'c', date: '', items: [], next: ''}, {x: 4, y: 5, w: 2}));
    assert.deepEqual(saved.grid, {x: 4, y: 5, w: 2});
});

test('an edit only replaces the fields that changed', () => {
    const text = '{"title": "a", "items": ["from a script"], "next": 0, "date": "2026-01-02"}';
    const saved = JSON.parse(withContent(text, {title: 'b'}));
    assert.deepEqual(saved, {title: 'b', date: '2026-01-02', items: ['from a script'], next: 0});
});

test('a new note starts from nothing', () => {
    const saved = JSON.parse(withContent(null,
        {title: 'a', date: '2026-01-02', items: ['b'], next: 'c'}, {x: 0, y: 0, w: 2}));
    assert.deepEqual(saved, {
        title: 'a', date: '2026-01-02', items: ['b'], next: 'c', grid: {x: 0, y: 0, w: 2},
    });
    assert.deepEqual(parseNote(JSON.stringify(saved)).items, ['b']);
});

test('emptyNote is blank', () => {
    assert.ok(isBlank(emptyNote()));
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
