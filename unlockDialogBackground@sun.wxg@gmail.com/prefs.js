const Gtk = imports.gi.Gtk;

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
    let setting_entry = new Gtk.Entry({ margin_left: 10, x_expand: true });

    setting_entry.set_text(gsettings.get_string('picture-uri'));
    setting_entry.connect('changed', (entry) => { gsettings.set_string('picture-uri', entry.get_text()); });

    hbox.pack_start(setting_label, true, true, 0);
    hbox.add(setting_entry);

    return hbox;
}

function addBoldTextToBox(text, box) {
    let txt = new Gtk.Label({xalign: 0, margin_top: 20});
    txt.set_markup('<b>' + text + '</b>');
    txt.set_line_wrap(true);
    box.add(txt);
}
