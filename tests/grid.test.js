import assert from 'node:assert/strict';
import {test} from 'node:test';

import {clamp, compact, metrics, move, overlaps, place, resize} from '../extension/lib/grid.js';

const item = (id, x, y, w = 2, h = 4) => ({id, x, y, w, h});
const at = (items, id) => items.find(i => i.id === id);

function assertTidy(items) {
    for (const a of items) {
        for (const b of items) {
            if (a !== b)
                assert.ok(!overlaps(a, b), `${a.id} overlaps ${b.id}`);
        }
        if (a.y > 0) {
            const above = {...a, y: a.y - 1};
            assert.ok(items.some(b => b !== a && overlaps(above, b)), `${a.id} could float up`);
        }
    }
}

test('overlaps treats shared edges as apart', () => {
    assert.ok(overlaps(item('a', 0, 0), item('b', 1, 1)));
    assert.ok(!overlaps(item('a', 0, 0), item('b', 2, 0)));
    assert.ok(!overlaps(item('a', 0, 0), item('b', 0, 4)));
});

test('clamp keeps an item inside the columns', () => {
    assert.deepEqual(clamp(item('a', 9, -3), 8), item('a', 6, 0));
    assert.deepEqual(clamp(item('a', 0, 0, 12), 8), item('a', 0, 0, 8));
});

test('compact floats items up and keeps their order', () => {
    const out = compact([item('b', 0, 20), item('a', 0, 9)], 8);
    assert.equal(at(out, 'a').y, 0);
    assert.equal(at(out, 'b').y, 4);
    assertTidy(out);
});

test('compact fits items back in when the grid shrinks', () => {
    const out = compact([item('a', 0, 0), item('b', 6, 0)], 4);
    assert.equal(at(out, 'b').x, 2);
    assertTidy(out);
});

test('place fills the shortest column, leftmost of the block first', () => {
    let items = [];
    const placed = [['a', 8], ['b', 3], ['c', 3], ['d', 3], ['e', 3], ['f', 3]];
    for (const [id, h] of placed)
        items = [...items, place({id, w: 2, h}, items, 11, 8)];
    assert.deepEqual([at(items, 'a').x, at(items, 'a').y], [6, 0]);
    assert.deepEqual([at(items, 'd').x, at(items, 'd').y], [0, 0]);
    assert.deepEqual([at(items, 'e').x, at(items, 'e').y], [4, 3]);
    assertTidy(items);
});

test('place still works when the screen is smaller than the block', () => {
    const out = place({id: 'a', w: 4, h: 2}, [], 2, 8);
    assert.deepEqual([out.x, out.y, out.w], [0, 0, 2]);
});

test('place uses the other columns before going off the screen', () => {
    const tall = [item('a', 0, 0, 2, 20), item('b', 2, 0, 2, 20)];
    const out = place({id: 'c', w: 2, h: 4}, tall, 8, 4, 22);
    assert.deepEqual([out.x, out.y], [4, 0]);
});

test('place stays in its block while there is still room there', () => {
    const tall = [item('a', 0, 0, 2, 5), item('b', 2, 0, 2, 5)];
    const out = place({id: 'c', w: 2, h: 4}, tall, 8, 4, 22);
    assert.equal(out.y, 5);
    assert.ok(out.x <= 2);
});

test('place falls back to below when there is no room anywhere', () => {
    const wall = [item('a', 0, 0, 4, 20)];
    const out = place({id: 'c', w: 2, h: 4}, wall, 4, 4, 22);
    assert.equal(out.y, 20);
});

test('dropping onto the top half of a card takes its place', () => {
    const items = [item('a', 0, 0, 2, 10), item('b', 2, 0)];
    const out = move(items, 'b', 0, 2, 8);
    assert.deepEqual([at(out, 'b').x, at(out, 'b').y], [0, 0]);
    assert.equal(at(out, 'a').y, 4);
    assertTidy(out);
});

test('dropping onto the bottom half of a card lands below it', () => {
    const items = [item('a', 0, 0, 2, 10), item('b', 2, 0)];
    const out = move(items, 'b', 0, 7, 8);
    assert.equal(at(out, 'a').y, 0);
    assert.deepEqual([at(out, 'b').x, at(out, 'b').y], [0, 10]);
    assertTidy(out);
});

test('dragging down past a neighbour swaps them', () => {
    const items = [item('a', 0, 0), item('b', 0, 4)];
    assert.equal(at(move(items, 'a', 0, 5, 8), 'a').y, 0, 'not past the middle yet');
    const out = move(items, 'a', 0, 6, 8);
    assert.equal(at(out, 'b').y, 0);
    assert.equal(at(out, 'a').y, 4);
    assertTidy(out);
});

test('dropping far below everything floats back up', () => {
    const out = move([item('a', 0, 0), item('b', 2, 0)], 'b', 2, 40, 8);
    assert.equal(at(out, 'b').y, 0);
});

test('dropping outside the grid stays inside it', () => {
    const out = move([item('a', 0, 0)], 'a', 99, -9, 8);
    assert.deepEqual([at(out, 'a').x, at(out, 'a').y], [6, 0]);
});

test('moving an unknown id changes nothing', () => {
    const items = [item('a', 0, 0)];
    assert.equal(move(items, 'nope', 1, 1, 8), items);
    assert.equal(resize(items, 'nope', 1, 1, 8), items);
});

test('growing a card pushes what is below it', () => {
    const items = [item('a', 0, 0), item('b', 0, 4)];
    const out = resize(items, 'a', 2, 9, 8);
    assert.equal(at(out, 'a').h, 9);
    assert.equal(at(out, 'b').y, 9);
    assertTidy(out);
});

test('widening a card moves neighbours out of the way', () => {
    const items = [item('a', 0, 0), item('b', 2, 0)];
    const out = resize(items, 'a', 4, 4, 8);
    assert.equal(at(out, 'a').y, 0);
    assert.equal(at(out, 'b').y, 4);
    assertTidy(out);
});

test('resize never grows past the grid', () => {
    const out = resize([item('a', 6, 0)], 'a', 20, 4, 8);
    assert.deepEqual([at(out, 'a').x, at(out, 'a').w], [0, 8]);
});

test('every move of a messy layout stays tidy', () => {
    const start = compact([
        item('a', 0, 0, 2, 7), item('b', 2, 0, 3, 3), item('c', 5, 0, 2, 9),
        item('d', 0, 7, 4, 2), item('e', 4, 3, 1, 5), item('f', 6, 9, 2, 6),
    ], 8);
    for (const {id} of start) {
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 24; y += 3)
                assertTidy(move(start, id, x, y, 8));
        }
    }
});

test('resize can move the card as it grows', () => {
    const out = resize([item('a', 2, 0)], 'a', 4, 4, 8, 0);
    assert.deepEqual([at(out, 'a').x, at(out, 'a').w], [0, 4]);
});

const geometry = metrics({x: 0, y: 32, width: 1920, height: 1048},
    {cell: 141, row: 18, gap: 18, margin: 40});

test('two cells make the classic 300px card', () => {
    assert.equal(geometry.widthOf(2), 300);
    assert.equal(geometry.cols, 11);
});

test('column zero sits against the right edge', () => {
    const {px, py} = geometry.toPixels({x: 0, y: 0, w: 2});
    assert.equal(px + geometry.widthOf(2), 1920 - 40);
    assert.equal(py, 32 + 40);
});

test('pixels and cells convert back and forth', () => {
    for (const cell of [{x: 0, y: 0, w: 2}, {x: 3, y: 7, w: 4}, {x: 7, y: 21, w: 3}]) {
        const {px, py} = geometry.toPixels(cell);
        assert.deepEqual(geometry.toCell(px, py, cell.w), {x: cell.x, y: cell.y});
    }
});

test('rowsFor always leaves room for the content', () => {
    for (const pixels of [1, 18, 19, 300, 341]) {
        const h = geometry.rowsFor(pixels);
        assert.ok(geometry.heightOf(h) >= pixels);
        assert.ok(h === 1 || geometry.heightOf(h - 1) < pixels);
    }
});
