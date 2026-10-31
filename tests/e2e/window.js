// A real application window, for checking how cards stack against one.
import Gtk from 'gi://Gtk?version=4.0';

const app = new Gtk.Application({application_id: 'org.mural.TestWindow'});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({application: app, title: 'over the notes'});
    window.set_default_size(1800, 900);
    window.present();
});
app.run([]);
