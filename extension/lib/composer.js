// Writing a note, right inside its card. Built around the keyboard: Enter keeps
// the thoughts coming, one bullet at a time, and the card grows as you type.
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {strings} from './strings.js';

const {KEY_Return, KEY_KP_Enter, KEY_Escape, KEY_Tab, KEY_ISO_Left_Tab, KEY_BackSpace, KEY_Up, KEY_Down} = Clutter;

function buildEntry(text, hint, styleClass) {
    const entry = new St.Entry({
        style_class: `mural-entry ${styleClass}`,
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

        this._title = this._wire(buildEntry(note.title, strings.titleHint, 'mural-title'));
        const head = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mural-head',
        });
        head.add_child(this._title);
        card.body.add_child(head);

        for (const item of note.items)
            this._addRow(item);
        if (note.next)
            this._showNext(note.next);
    }

    focus() {
        const target = this._title.text ? this._fields().at(-1) : this._title;
        target.grab_key_focus();
        target.clutter_text.set_cursor_position(-1);
    }

    _fields() {
        return [this._title, ...this._rows.map(r => r.entry), ...(this._next ? [this._next] : [])];
    }

    _wire(entry) {
        entry.clutter_text.connect('key-press-event', (_, event) => this._onKey(entry, event));
        entry.clutter_text.connect('text-changed', () => this._onGrow());
        return entry;
    }

    _addRow(text = '', after = null, animate = false) {
        const box = new St.BoxLayout({style_class: 'mural-row'});
        box.add_child(new St.Label({text: '•', style_class: 'mural-bullet'}));
        const entry = this._wire(buildEntry(text, strings.itemHint, 'mural-item'));
        box.add_child(entry);

        const row = {box, entry};
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

    _removeRow(row) {
        this._rows.splice(this._rows.indexOf(row), 1);
        row.box.destroy();
        this._onGrow();
    }

    _showNext(text = '') {
        this._next = this._wire(buildEntry(text, strings.nextHint, 'mural-next-text'));
        this._nextBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mural-next',
        });
        this._nextBox.add_child(new St.Label({text: strings.next, style_class: 'mural-next-head'}));
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
        const fields = this._fields();
        const index = fields.indexOf(entry);
        const row = this._rows.find(r => r.entry === entry);

        switch (key) {
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
        case KEY_Up:
            fields[index - 1]?.grab_key_focus();
            return Clutter.EVENT_STOP;
        case KEY_Down:
            fields[index + 1]?.grab_key_focus();
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

    // Enter moves on. On an empty bullet it means "that's all of those", so the
    // bullet goes away and the next step opens.
    _onEnter(entry, row) {
        if (entry === this._next) {
            this.finish();
        } else if (entry === this._title) {
            (this._rows[0] ?? this._addRow('', null, true)).entry.grab_key_focus();
        } else if (row.entry.text.trim()) {
            this._addRow('', row, true).entry.grab_key_focus();
        } else {
            this._openNext();
            this._removeRow(row);
        }
    }

    values() {
        return {
            title: this._title.text.trim(),
            items: this._rows.map(r => r.entry.text.trim()).filter(Boolean),
            next: this._next?.text.trim() ?? '',
        };
    }

    finish() {
        if (this._finished)
            return;
        this._finished = true;
        this._onFinish(this.values());
    }
}
