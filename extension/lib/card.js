// One note on screen: draws its contents and knows how much room they need.
// Where it sits and how it moves is up to the board.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {buildMark, setDoneStyle, setMark, staticBullet} from './mark.js';
import {daysSince, itemDone, itemText} from './notes.js';
import {strings} from './strings.js';

const ARMED_MS = 2500;

export function wrapped(text, styleClass) {
    const label = new St.Label({text, style_class: styleClass, x_expand: true});
    label.clutter_text.line_wrap = true;
    label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    return label;
}

export function whenText(iso) {
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
            style_class: 'grid-notes-card',
            layout_manager: new Clutter.BinLayout(),
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });
        this.actor.set_cursor_type(Clutter.CursorType.GRAB);
        this.body = new St.BoxLayout({
            style_class: 'grid-notes-body',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.actor.add_child(this.body);

        this.grips = [this._buildGrip('right'), this._buildGrip('left')];

        this.close = new St.Button({
            style_class: 'grid-notes-close',
            label: '×',
            opacity: 0,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.START,
        });
        this.close.set_cursor_type(Clutter.CursorType.POINTER);
        this.close.connect('clicked', () => this._onClose());
        this.actor.add_child(this.close);
        this.actor.connect('notify::hover', () => this._syncControls());

        this.render();
    }

    // Controls stay out of sight until the pointer is over the card.
    _syncControls() {
        for (const control of [...this.grips, this.close]) {
            control.ease({
                opacity: this.actor.hover ? 255 : 0,
                duration: 140,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        if (!this.actor.hover)
            this._disarmClose();
    }

    // Deleting takes two clicks, and a pause or moving away cancels it.
    _onClose() {
        if (this._armed) {
            this._disarmClose();
            this.onDelete?.();
            return;
        }
        this._armed = true;
        this.close.label = strings.confirmDelete;
        this.close.add_style_class_name('grid-notes-close-armed');
        this._armedId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ARMED_MS, () => {
            this._armedId = 0;
            this._disarmClose();
            return GLib.SOURCE_REMOVE;
        });
    }

    _disarmClose() {
        if (this._armedId)
            GLib.source_remove(this._armedId);
        this._armedId = 0;
        this._armed = false;
        this.close.label = '×';
        this.close.remove_style_class_name('grid-notes-close-armed');
    }

    // One on each bottom corner: a card against the screen edge can only grow
    // by pulling the side away from it.
    _buildGrip(side) {
        const align = side === 'right' ? Clutter.ActorAlign.END : Clutter.ActorAlign.START;
        const grip = new St.Widget({
            style_class: 'grid-notes-grip',
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
            style_class: `grid-notes-grip-mark grid-notes-grip-mark-${side}`,
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
            style_class: 'grid-notes-head',
        });
        // Which text on the card belongs to which field, to find what was clicked.
        this._spots = [];
        // A broken file has no title of its own, but still needs telling apart.
        const title = note.title || (this.error ? this.file : '');
        if (title) {
            const label = wrapped(title, 'grid-notes-title');
            head.add_child(label);
            this._spots.push({field: 'title', label});
        }
        if (note.date)
            head.add_child(wrapped(whenText(note.date), 'grid-notes-date'));
        if (title || note.date)
            this.body.add_child(head);

        const items = this.error ? [strings.unreadable(this.error)] : note.items;
        this._checks = new Map();
        items.forEach((item, index) => {
            const row = new St.BoxLayout({style_class: 'grid-notes-row'});
            const done = itemDone(item);
            const label = wrapped(itemText(item), 'grid-notes-item');
            if (done === null) {
                row.add_child(staticBullet());
            } else {
                const mark = buildMark(done);
                mark.connect('clicked', () => this.onToggle?.(index));
                row.add_child(mark);
                setDoneStyle(label, done);
                this._checks.set(index, {mark, label});
            }
            row.add_child(label);
            this.body.add_child(row);
            this._spots.push({field: index, label});
        });

        if (note.next) {
            const next = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'grid-notes-next',
            });
            next.add_child(new St.Label({text: strings.next, style_class: 'grid-notes-next-head'}));
            const label = wrapped(note.next, 'grid-notes-next-text');
            next.add_child(label);
            this.body.add_child(next);
            this._spots.push({field: 'next', label});
        }
    }

    // Changed in place: this runs from the checkbox's own click, too early to
    // destroy it, and ticking a box doesn't change how much room the card needs.
    setDone(index, done) {
        const {note} = this;
        note.items = note.items.with(index, {...note.items[index], done});
        const {mark, label} = this._checks.get(index);
        setMark(mark, done);
        setDoneStyle(label, done);
    }

    // The field and character at a point on screen, or null off any text.
    locate(x, y) {
        for (const {field, label} of this._spots) {
            const [inside, lx, ly] = label.transform_stage_point(x, y);
            if (inside && ly >= 0 && ly < label.height)
                return {field, position: label.clutter_text.coords_to_position(lx, ly)};
        }
        return null;
    }

    // Buttons on the card that have to see their own press and release.
    isControl(actor) {
        return actor === this.close ||
            [...this._checks.values()].some(({mark}) => mark === actor);
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

    setEditing(editing) {
        this.editing = editing;
        if (editing)
            this.actor.add_style_class_name('grid-notes-card-editing');
        else
            this.actor.remove_style_class_name('grid-notes-card-editing');
        this.actor.set_cursor_type(editing ? Clutter.CursorType.DEFAULT : Clutter.CursorType.GRAB);
        for (const control of [...this.grips, this.close])
            control.visible = !editing;
    }

    // Stops any motion and takes the resting pose, so an interrupted animation
    // can't leave the card half faded or off to one side.
    settle() {
        const {actor} = this;
        actor.remove_all_transitions();
        actor.set({opacity: 255, translation_y: 0, scale_x: 1, scale_y: 1, rotation_angle_z: 0});
    }

    // Fades in from slightly below, a little late when arriving with others.
    appear(delay = 0) {
        const {actor} = this;
        actor.set({opacity: 0, scale_x: 0.94, scale_y: 0.94, translation_y: 12});
        // Separate, because opacity is a byte: overshooting 255 wraps around to
        // nearly invisible and the card blinks just as it should be settling.
        actor.ease({
            opacity: 255,
            delay,
            duration: 220,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        actor.ease({
            scale_x: 1,
            scale_y: 1,
            translation_y: 0,
            delay,
            duration: 420,
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
    }

    // A short nudge, to show the contents just changed.
    pulse() {
        const {actor} = this;
        actor.ease({
            scale_x: 1.025,
            scale_y: 1.025,
            duration: 130,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => actor.ease({
                scale_x: 1,
                scale_y: 1,
                duration: 320,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            }),
        });
    }

    vanish() {
        const {actor} = this;
        this._disarmClose();
        actor.reactive = false;
        actor.ease({
            opacity: 0,
            scale_x: 0.88,
            scale_y: 0.88,
            translation_y: -8,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => actor.destroy(),
        });
    }

    destroy() {
        this._disarmClose();
        this.actor.destroy();
    }
}
