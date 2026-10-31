// One note on screen: draws its contents and knows how much room they need.
// Where it sits and how it moves is up to the board.
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {daysSince} from './notes.js';
import {strings} from './strings.js';

function wrapped(text, styleClass) {
    const label = new St.Label({text, style_class: styleClass, x_expand: true});
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return label;
}

function whenText(iso) {
    const days = daysSince(iso, new Date());
    if (days === null)
        return iso;
    const relative = days <= 0 ? strings.today
        : days === 1 ? strings.yesterday
            : strings.daysAgo(days);
    const [, month, day] = iso.split('-');
    return `${relative} · ${day.slice(0, 2)}/${month}`;
}

export class Card {
    constructor(file, note, error = null) {
        this.file = file;
        this.note = note;
        this.error = error;
        // The height the person asked for by resizing; without one, the card
        // is exactly as tall as its contents.
        this.userRows = note.grid?.h ?? 0;

        this.actor = new St.Widget({
            style_class: 'mural-card',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.actor.set_cursor_type(Clutter.CursorType.GRAB);
        this.body = new St.BoxLayout({
            style_class: 'mural-body',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this.body);

        this.grips = [this._buildGrip('right'), this._buildGrip('left')];
        this.actor.connect('notify::hover', () => this._syncControls());

        this.render();
    }

    // Controls stay out of sight until the pointer is over the card.
    _syncControls() {
        for (const grip of this.grips) {
            grip.ease({
                opacity: this.actor.hover ? 255 : 0,
                duration: 140,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    // One on each bottom corner: a card against the screen edge can only grow
    // by pulling the side away from it.
    _buildGrip(side) {
        const align = side === 'right' ? Clutter.ActorAlign.END : Clutter.ActorAlign.START;
        const grip = new St.Widget({
            style_class: 'mural-grip',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            opacity: 0,
            x_expand: true,
            y_expand: true,
            x_align: align,
            y_align: Clutter.ActorAlign.END,
        });
        grip.side = side;
        grip.add_child(new St.Widget({
            style_class: `mural-grip-mark mural-grip-mark-${side}`,
            x_expand: true,
            y_expand: true,
            x_align: align,
            y_align: Clutter.ActorAlign.END,
        }));
        grip.set_cursor_type(side === 'right'
            ? Clutter.CursorType.SE_RESIZE : Clutter.CursorType.SW_RESIZE);
        this.actor.add_child(grip);
        return grip;
    }

    render() {
        this.body.destroy_all_children();
        const {note} = this;

        const head = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'mural-head',
        });
        head.add_child(wrapped(note.title || this.file, 'mural-title'));
        if (note.date)
            head.add_child(wrapped(whenText(note.date), 'mural-date'));
        this.body.add_child(head);

        const items = this.error ? [strings.unreadable(this.error)] : note.items;
        for (const item of items) {
            const row = new St.BoxLayout({style_class: 'mural-row'});
            row.add_child(new St.Label({text: '•', style_class: 'mural-bullet'}));
            row.add_child(wrapped(item, 'mural-item'));
            this.body.add_child(row);
        }

        if (note.next) {
            const next = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'mural-next',
            });
            next.add_child(new St.Label({text: strings.next, style_class: 'mural-next-head'}));
            next.add_child(wrapped(note.next, 'mural-next-text'));
            this.body.add_child(next);
        }
    }

    // The pixel height the contents need when the card is this wide. Measured
    // on the body because the card itself has a fixed size once it's placed.
    naturalHeight(width) {
        const node = this.actor.get_theme_node();
        const sideX = node.get_padding(St.Side.LEFT) + node.get_padding(St.Side.RIGHT) +
            node.get_border_width(St.Side.LEFT) + node.get_border_width(St.Side.RIGHT);
        const sideY = node.get_padding(St.Side.TOP) + node.get_padding(St.Side.BOTTOM) +
            node.get_border_width(St.Side.TOP) + node.get_border_width(St.Side.BOTTOM);
        const [, height] = this.body.get_preferred_height(width - sideX);
        return height + sideY;
    }

    destroy() {
        this.actor.destroy();
    }
}
