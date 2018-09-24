const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gdk = imports.gi.Gdk;
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const SCHEMA_NAME = 'org.gnome.shell.extensions.unlockDialogBackground';

let gsettings;

function init() {
    gsettings = Convenience.getSettings(SCHEMA_NAME);
}

function buildPrefsWidget() {
    let widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        border_width: 10
    });

    let vbox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin: 20, margin_top: 0
    });
    vbox.set_size_request(550, 350);

    addBoldTextToBox("Enable and disable unblank function", vbox);
    vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
    vbox.add(addSwitch());

    addBoldTextToBox("Change background", vbox);
    vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
    vbox.add(addPictureUrl());
    vbox.add(addPictureShow());

    widget.add(vbox);

    widget.show_all();
    return widget;
}

function addSwitch() {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
    let setting_label = new Gtk.Label({ label: "Open Unlock Dialog Background", xalign: 0 });
    let setting_switch = new Gtk.Switch({ active: gsettings.get_boolean('switch') });

    setting_switch.connect('notify::active', (button) => { gsettings.set_boolean('switch', button.active); });

    hbox.pack_start(setting_label, true, true, 0);
    hbox.add(setting_switch);

    return hbox;
}

function addPictureUrl() {
    let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
    let setting_label = new Gtk.Label({ label: "Picture", xalign: 0 });
    let setting_entry = new Gtk.Entry({ hexpand: true, margin_left: 20 });

    setting_entry.set_text(gsettings.get_string('picture-uri'));
    setting_entry.connect('changed', (entry) => { gsettings.set_string('picture-uri', entry.get_text()); });

    hbox.pack_start(setting_label, false, true, 0);
    hbox.add(setting_entry);

    return hbox;
}

function draw_callback(widget, cr) {
}

function addPictureShow() {
    //let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5, expand: false });
    let pixbuf = GdkPixbuf.Pixbuf.new_from_file('/home/suse/test.png');
    //pixbuf.scale_simple(50, 20, GdkPixbuf.InterpType.BILINEAR);
    //let image = new Gtk.Image();
    //image.set_from_file(gsettings.get_string('picture-uri'));
    //image.set_from_file("/home/suse/test.png");
    //image.set_pixel_size(50);
    //image.set_from_pixbuf(pixbuf);

    //hbox.pack_start(image, true, true, 0);

    let drawArea = new Gtk.DrawingArea();
    drawArea.set_size_request(200,100);
    drawArea.connect('draw', (da) => {
	    let cr = Gdk.cairo_create(da.get_window());
	    Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
	    //Cairo.paint(cr);
	    //Gdk.cairo_fill(cr);
	    //cr.cairo_paint();
	    da.get_window().cairo_paint();
    });

    return drawArea;
}

function addBoldTextToBox(text, box) {
    let txt = new Gtk.Label({xalign: 0, margin_top: 20});
    txt.set_markup('<b>' + text + '</b>');
    txt.set_line_wrap(true);
    box.add(txt);
}
