// Writing a note, right inside its card. Built around the keyboard: Enter keeps
// the thoughts coming, one bullet at a time, and the card grows as you type.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {whenText, wrapped} from './card.js';
import {verticalBox} from './compat.js';
import {buildMark, setDoneStyle, setMark} from './mark.js';
import {itemDone, itemText, makeItem} from './notes.js';
import {strings} from './strings.js';

const encoder = new TextEncoder();

const {KEY_Return, KEY_KP_Enter, KEY_Escape, KEY_Tab, KEY_ISO_Left_Tab, KEY_BackSpace, KEY_Up, KEY_Down, KEY_t, KEY_T} = Clutter;

// More than a card could ever show, and enough to stop an accidental paste of a
// whole file from freezing the desktop. Never less than what's already there.
const MAX_CHARS = 10000;

function buildEntry(text, hint, styleClass) {
    const entry = new St.Entry({
        style_class: `grid-notes-entry ${styleClass}`,
        text,
        hint_text: hint,
        can_focus: true,
        x_expand: true,
    });
    const {clutter_text: inner} = entry;
    inner.single_line_mode = false;
    inner.activatable = false;
    inner.line_wrap = true;
    inner.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    inner.ellipsize = Pango.EllipsizeMode.NONE;
    inner.max_length = Math.max(MAX_CHARS, text.length);
    // An entry is as tall as its hint even while that's hidden, and a hidden
    // hint never gets styled. In the default font it would make every line
    // taller than the text, which jumps the moment editing starts.
    entry.connect('style-changed', () => {
        entry.hint_actor.clutter_text.font_description = entry.get_theme_node().get_font();
    });
    return entry;
}

// Slides a freshly added row into view.
function reveal(actor) {
    actor.set({opacity: 0, translation_y: -8});
    actor.ease({
        opacity: 255,
        translation_y: 0,
        duration: 220,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}

export class Composer {
    constructor(card, {onGrow, onFinish}) {
        this.card = card;
        this._onGrow = onGrow;
        this._onFinish = onFinish;
        this._rows = [];
        this._nextBox = null;

        const {note} = card;
        card.body.destroy_all_children();

        this._title = this._wire(buildEntry(note.title, strings.titleHint, 'grid-notes-title'));
        const head = verticalBox({
            style_class: 'grid-notes-head',
        });
        head.add_child(this._title);
        // Not editable, but it holds its line: without it all the text below
        // would jump up the moment writing starts.
        if (note.date)
            head.add_child(wrapped(whenText(note.date), 'grid-notes-date'));
        card.body.add_child(head);

        for (const item of note.items)
            this._addRow(itemText(item), null, false, itemDone(item));
        if (note.next)
            this._showNext(note.next);
        this._initial = JSON.stringify(this.values());
    }

    // What has been saved along the way no longer counts as a change.
    markSaved() {
        this._initial = JSON.stringify(this.values());
    }

    // Only what differs from when writing started, so that opening a note
    // doesn't count as editing it even though values() tidies up whitespace and
    // blank lines, and so a save leaves every other field to the file.
    changes() {
        const now = this.values();
        const initial = JSON.parse(this._initial);
        return Object.fromEntries(Object.entries(now).filter(([name, value]) =>
            JSON.stringify(value) !== JSON.stringify(initial[name])));
    }

    // At the spot that was clicked if there is one, or else ready to carry on
    // from the end of the note.
    focus(spot = null) {
        const clicked = spot && ({title: this._title, next: this._next}[spot.field] ??
            this._rows[spot.field]?.entry);
        const target = clicked ?? (this._title.text ? this._fields().at(-1) : this._title);
        target.grab_key_focus();
        target.clutter_text.set_cursor_position(clicked ? spot.position : -1);
    }

    _fields() {
        return [this._title, ...this._rows.map(r => r.entry), ...(this._next ? [this._next] : [])];
    }

    _wire(entry) {
        entry.clutter_text.connect('key-press-event', (_, event) => this._onKey(entry, event));
        entry.clutter_text.connect('text-changed', () => this._onTextChanged(entry));
        return entry;
    }

    // Typing can't put a line break in a field, since Enter moves on. Pasting
    // can: a pasted list becomes lines of the note, anywhere else it's one line.
    _onTextChanged(entry) {
        if (!entry.text.includes('\n')) {
            this._onGrow();
            return;
        }
        const row = this._rows.find(r => r.entry === entry);
        if (!row) {
            entry.text = entry.text.replace(/\s*\n\s*/g, ' ');
            return;
        }
        const [first = '', ...rest] = entry.text.split('\n').map(line => line.trim()).filter(Boolean);
        let last = row;
        for (const line of rest)
            last = this._addRow(line, last, true, row.done === null ? null : false);
        entry.text = first;
        last.entry.grab_key_focus();
        last.entry.clutter_text.set_cursor_position(-1);
    }

    _addRow(text = '', after = null, animate = false, done = null) {
        const box = new St.BoxLayout({style_class: 'grid-notes-row'});
        const mark = buildMark(done);
        box.add_child(mark);
        const entry = this._wire(buildEntry(text, strings.itemHint, 'grid-notes-item'));
        box.add_child(entry);
        setDoneStyle(entry, done);

        const row = {box, mark, entry, done};
        mark.connect('clicked', () => this._cycle(row));
        const index = after ? this._rows.indexOf(after) + 1 : this._rows.length;
        this._rows.splice(index, 0, row);
        // The body holds the head, then the rows, then the next box.
        this.card.body.insert_child_at_index(box, index + 1);
        if (animate) {
            reveal(box);
            this._onGrow();
        }
        return row;
    }

    // Bullet, empty checkbox, ticked checkbox, and back to a bullet.
    _cycle(row) {
        row.done = row.done === null ? false : row.done === false ? true : null;
        setMark(row.mark, row.done);
        setDoneStyle(row.entry, row.done);
        this._onGrow();
    }

    _removeRow(row) {
        this._rows.splice(this._rows.indexOf(row), 1);
        row.box.destroy();
        this._onGrow();
    }

    _showNext(text = '') {
        this._next = this._wire(buildEntry(text, strings.nextHint, 'grid-notes-next-text'));
        this._nextBox = verticalBox({
            style_class: 'grid-notes-next',
        });
        this._nextBox.add_child(new St.Label({text: strings.next, style_class: 'grid-notes-next-head'}));
        this._nextBox.add_child(this._next);
        this.card.body.add_child(this._nextBox);
    }

    _hideNext() {
        this._nextBox.destroy();
        this._nextBox = this._next = null;
        this._onGrow();
    }

    _openNext() {
        if (!this._next) {
            this._showNext();
            reveal(this._nextBox);
            this._onGrow();
        }
        this._next.grab_key_focus();
    }

    _onKey(entry, event) {
        const key = event.get_key_symbol();
        const control = event.get_state() & Clutter.ModifierType.CONTROL_MASK;
        const alt = event.get_state() & Clutter.ModifierType.MOD1_MASK;
        const fields = this._fields();
        const index = fields.indexOf(entry);
        const row = this._rows.find(r => r.entry === entry);

        switch (key) {
        case KEY_t:
        case KEY_T:
            if (!control || !row)
                return Clutter.EVENT_PROPAGATE;
            this._cycle(row);
            return Clutter.EVENT_STOP;
        case KEY_Escape:
            this.finish();
            return Clutter.EVENT_STOP;
        case KEY_Return:
        case KEY_KP_Enter:
            if (control)
                this.finish();
            else
                this._onEnter(entry, row);
            return Clutter.EVENT_STOP;
        case KEY_Tab:
            if (fields[index + 1])
                fields[index + 1].grab_key_focus();
            else if (this._next)
                this._title.grab_key_focus();
            else
                this._openNext();
            return Clutter.EVENT_STOP;
        case KEY_ISO_Left_Tab:
            fields[index - 1]?.grab_key_focus();
            return Clutter.EVENT_STOP;
        case KEY_Up:
        case KEY_Down:
            if (alt && row) {
                this._moveRow(row, key === KEY_Up ? -1 : 1);
                return Clutter.EVENT_STOP;
            }
            if (this._hasLineTowards(entry, key))
                return Clutter.EVENT_PROPAGATE;
            fields[index + (key === KEY_Up ? -1 : 1)]?.grab_key_focus();
            return Clutter.EVENT_STOP;
        case KEY_BackSpace:
            if (entry.text)
                return Clutter.EVENT_PROPAGATE;
            if (row) {
                fields[index - 1].grab_key_focus();
                this._removeRow(row);
            } else if (entry === this._next) {
                fields[index - 1].grab_key_focus();
                this._hideNext();
            }
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    // Text long enough to wrap has lines of its own to move through first.
    _hasLineTowards(entry, key) {
        const {clutter_text: inner} = entry;
        const layout = inner.get_layout();
        const lines = layout.get_line_count();
        if (lines < 2)
            return false;
        const cursor = inner.get_cursor_position();
        const before = cursor < 0 ? inner.text : [...inner.text].slice(0, cursor).join('');
        const [line] = layout.index_to_line_x(encoder.encode(before).length, false);
        return key === KEY_Up ? line > 0 : line < lines - 1;
    }

    _moveRow(row, by) {
        const from = this._rows.indexOf(row);
        const to = from + by;
        if (to < 0 || to >= this._rows.length)
            return;
        this._rows.splice(from, 1);
        this._rows.splice(to, 0, row);
        // The body holds the head, then the rows, then the next box.
        this.card.body.set_child_at_index(row.box, to + 1);
        row.entry.grab_key_focus();
        this._onGrow();
    }

    // Enter moves on. On an empty bullet it means "that's all of those", so the
    // bullet goes away and the next step opens.
    _onEnter(entry, row) {
        if (entry === this._next) {
            this.finish();
        } else if (entry === this._title) {
            (this._rows[0] ?? this._addRow('', null, true)).entry.grab_key_focus();
        } else if (row.entry.text.trim()) {
            // A list of checkboxes carries on as one.
            this._addRow('', row, true, row.done === null ? null : false).entry.grab_key_focus();
        } else {
            this._openNext();
            this._removeRow(row);
        }
    }

    values() {
        return {
            title: this._title.text.trim(),
            items: this._rows.filter(r => r.entry.text.trim())
                .map(r => makeItem(r.entry.text.trim(), r.done)),
            next: this._next?.text.trim() ?? '',
        };
    }

    // The board can refuse to close, when saving failed and the text would
    // otherwise be lost.
    finish() {
        if (this._finished || this._finishing)
            return;
        this._finishing = true;
        this._finished = this._onFinish(this.values(), this.changes());
        this._finishing = false;
    }
}
