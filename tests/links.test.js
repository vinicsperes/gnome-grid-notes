import assert from 'node:assert/strict';
import {test} from 'node:test';

import {linkAt, parseLinks, sourcePosition} from '../extension/lib/links.js';

test('text without links is shown as it is', () => {
    const parsed = parseLinks('plain [text] (here)');
    assert.equal(parsed.shown, 'plain [text] (here)');
    assert.deepEqual(parsed.links, []);
});

test('a link shows only its words', () => {
    const parsed = parseLinks('see [the docs](https://example.com/a?b=1) now');
    assert.equal(parsed.shown, 'see the docs now');
    assert.deepEqual(parsed.links, [{start: 4, end: 12, url: 'https://example.com/a?b=1'}]);
});

test('several links, and only addresses that are safe to open', () => {
    const parsed = parseLinks('[a](http://x.io) [b](javascript:alert(1)) [c](mailto:me@x.io)');
    assert.equal(parsed.shown, 'a [b](javascript:alert(1)) c');
    assert.deepEqual(parsed.links.map(l => l.url), ['http://x.io', 'mailto:me@x.io']);
});

test('characters are counted as the text widget counts them', () => {
    const parsed = parseLinks('😀 é [ação](https://x.io)');
    assert.equal(parsed.shown, '😀 é ação');
    assert.deepEqual(parsed.links, [{start: 4, end: 8, url: 'https://x.io'}]);
});

test('finds the link under a character', () => {
    const parsed = parseLinks('go [here](https://x.io) ok');
    assert.equal(linkAt(parsed, 2), null);
    assert.equal(linkAt(parsed, 3).url, 'https://x.io');
    assert.equal(linkAt(parsed, 6).url, 'https://x.io');
    assert.equal(linkAt(parsed, 7), null);
});

test('a position on the card maps back to the text of the file', () => {
    const text = 'go [here](https://x.io) ok';
    const parsed = parseLinks(text);
    assert.equal(sourcePosition(parsed, 0), 0);
    assert.equal(sourcePosition(parsed, 3), 4, 'first letter of the words, past the [');
    assert.equal(sourcePosition(parsed, 5), 6);
    assert.equal(sourcePosition(parsed, 7), text.indexOf(' ok'), 'just after the link');
    assert.equal(sourcePosition(parsed, parsed.shown.length), text.length);
});

test('positions after several links add up what each hid', () => {
    const text = '[a](http://x.io) and [b](http://y.io)!';
    const parsed = parseLinks(text);
    assert.equal(parsed.shown, 'a and b!');
    assert.equal(sourcePosition(parsed, 7), text.indexOf('!'), 'after the second link');
    assert.equal(sourcePosition(parsed, 6), text.indexOf('b]'), 'the words of the second');
});
