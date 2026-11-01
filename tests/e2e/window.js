// A real application window, for checking how cards stack against one.
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({application_id: 'org.mural.TestWindow'});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: 'over the notes'});
    const [width, height] = (GLib.getenv('MURAL_WINDOW') ?? '1800x900').split('x').map(Number);
    window.set_default_size(width, height);
    window.present();
});
app.run([]);
