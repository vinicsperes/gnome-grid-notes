<h1 align="center">Grid Notes</h1>

<p align="center">Notes on your GNOME desktop that snap to a grid and always stay tidy.</p>

<p align="center">
  <a href="https://github.com/vinicsperes/gnome-grid-notes/actions/workflows/ci.yml"><img src="https://github.com/vinicsperes/gnome-grid-notes/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/GNOME%20Shell-50-e50f3d" alt="GNOME Shell 50">
  <img src="https://img.shields.io/badge/license-MIT-e50f3d" alt="license">
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Dragging, resizing and writing notes in Grid Notes" width="860">
</p>

Grid Notes puts small cards on your desktop: above the wallpaper, below your windows.
Pick one up and the grid appears, with a slot showing where it will land while
its neighbours slide out of the way. Let go and it clicks into place. There is no
way to leave a card crooked, overlapping or floating loose.

Each note is a plain JSON file, so anything that can write a file can put a note
on your desktop.

## Features

- **Drag** cards around. They always land on the grid, and the rest make room
- **Resize** from either bottom corner, in whole grid steps
- **Write in place**: the card grows as you type, pushing its neighbours along,
  and what you write is saved as you go
- **Checkboxes**: any line can be one, ticked with a click right on the card
- **Undo**: a deleted note can be brought back to the same place for a few seconds
- **Scrolls when it has to**: notes taller than the screen stay within reach
- **Works over your windows**: one shortcut brings the notes forward to jot
  something down or rearrange them, and Esc sends them back
- **Plain files**: edit, add or delete a file and the desktop follows right away
- **Hide them all** with one shortcut before sharing your screen
- **Plays nicely with desktop icons**: empty space still belongs to them
- English and Portuguese, following your session language

## Install

Requires GNOME Shell 50 on Wayland.

Download `grid-notes@desktop.shell-extension.zip` from the
[latest release](https://github.com/vinicsperes/gnome-grid-notes/releases/latest),
then:

```sh
gnome-extensions install grid-notes@desktop.shell-extension.zip
```

Log out and back in, then turn it on:

```sh
gnome-extensions enable grid-notes@desktop
```

To remove it, run `gnome-extensions uninstall grid-notes@desktop`. Your notes stay
where they are.

### From source

Needs `make` and `glib-compile-schemas`. Follows the code in your clone, so
pulling changes takes effect at your next login.

```sh
git clone https://github.com/vinicsperes/gnome-grid-notes.git
cd gnome-grid-notes
make install
```

## Using it

| Action | How |
| --- | --- |
| New note | `Ctrl` `Alt` `N`, or the **+** slot on the board |
| Bring notes in front of your windows | `Ctrl` `Alt` `M`, and `Esc` to send them back |
| Move a note | Drag it |
| Resize a note | Drag a bottom corner |
| Edit a note | Double click it |
| Tick a checkbox | Click it |
| Delete a note | **×** in its corner, twice, then **Undo** if that was a mistake. After that it's in the trash |
| Scroll, when the notes don't fit | The wheel or touchpad over a note, or the arrow at the bottom. A card dragged to the edge scrolls too |
| Hide or show all notes | `Ctrl` `Alt` `H` |

Shortcuts can be changed in the extension's preferences, from the Extensions app
or with `gnome-extensions prefs grid-notes@desktop`.

While writing:

| Key | Does |
| --- | --- |
| `Enter` | Next line, or a new bullet |
| `Ctrl` `V` with a list | Each line of it becomes a line of the note |
| `Enter` on an empty bullet | Moves on to the next step |
| `Backspace` on an empty line | Removes it |
| `Ctrl` `T`, or a click on the bullet | Bullet, checkbox, ticked, and back to a bullet |
| `Tab`, `Up`, `Down` | Move between lines |
| `Alt` `Up`, `Alt` `Down` | Move the current line up or down the list |
| `Esc`, `Ctrl` `Enter` or a click outside | Finish and save |

## Note files

Notes live in `~/.local/share/grid-notes`, one `.json` file each:

```json
{
  "title": "Launch",
  "date": "2026-10-29",
  "items": ["Landing page shipped", "Waitlist at 1,204 people"],
  "next": "write the launch post and pick a date"
}
```

A line in `items` can also be a checkbox, written as
`{"text": "Book the venue", "done": false}`.

Every field is optional. `date` shows up as "2 days ago", and `next` gets the
highlighted box at the bottom. Grid Notes adds a `grid` field with the position, and
keeps any other fields you add, so your own tools can store data alongside.

A file that can't be read gets a card saying so and is never overwritten.

## Privacy

Notes are stored as plain text and never leave your computer: Grid Notes makes no
network connections. They do show on your desktop, including while sharing your
screen, so keep passwords and the like somewhere else, and press `Ctrl` `Alt` `H`
before you share. They stay hidden until you press it again, even across locking
the screen or logging out. Notes are also hidden while the screen is locked.

## Development

```sh
make test   # the grid and file format rules, needs Node
make e2e    # real drags and typing in a headless GNOME Shell
```

The end-to-end tests run a private GNOME Shell with its own data and settings, so
they are safe to run from the session you are working in.

## License

[MIT](LICENSE)
