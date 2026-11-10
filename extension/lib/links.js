// Links written as [text](https://...) inside a line of a note. No GNOME
// imports, so it can be tested on its own.
//
// The file keeps the text exactly as it was written. The card shows only the
// words, and this finds which part of them is a link and where it goes.

// Only addresses that open somewhere harmless: no file: or javascript:.
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s()]+)\)/gu;

const length = text => [...text].length;

// `shown` is what the card draws. Each link says which characters of it are the
// link, counted in characters like the text widget counts them. `starts` has
// where each piece of the file's text landed, to find the way back.
export function parseLinks(text) {
    const links = [];
    const starts = [];
    let shown = '';
    let last = 0;
    for (const match of text.matchAll(LINK)) {
        const before = text.slice(last, match.index);
        shown += before;
        const start = length(shown);
        shown += match[1];
        links.push({start, end: length(shown), url: match[2]});
        starts.push({
            shown: start,
            source: length(text.slice(0, match.index)),
            wordsLength: length(match[1]),
            fullLength: length(match[0]),
        });
        last = match.index + match[0].length;
    }
    shown += text.slice(last);
    return {shown, links, starts};
}

// The link under a character of the shown text, or null.
export function linkAt(parsed, position) {
    return parsed.links.find(({start, end}) => position >= start && position < end) ?? null;
}

// Where a character of the shown text is in the text of the file. Inside a
// link the cursor goes to the same letter of the words, past the "[".
export function sourcePosition(parsed, position) {
    let hidden = 0;
    for (const link of parsed.starts) {
        if (position < link.shown)
            break;
        if (position < link.shown + link.wordsLength)
            return link.source + 1 + (position - link.shown);
        hidden += link.fullLength - link.wordsLength;
    }
    return position + hidden;
}
