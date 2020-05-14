const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gdk = imports.gi.Gdk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const SCHEMA_NAME = 'org.gnome.shell.extensions.unlockDialogBackground';

function init() {
}

function buildPrefsWidget() {
    let widget = new PrefsWidget();
    widget.widget.show_all();

    return widget.widget;
}

class PrefsWidget {
    constructor() {
        this.gsettings = ExtensionUtils.getSettings(SCHEMA_NAME);

        this.widget = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            border_width: 10
        });

        this.vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin: 20, margin_top: 0
        });
        this.vbox.set_size_request(550, 650);

        this.addBoldTextToBox("Enable and disable unblank function", this.vbox);
        this.vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        this.vbox.add(this.addSwitch());

        this.addBoldTextToBox("Change background", this.vbox);
        this.vbox.add(new Gtk.HSeparator({margin_bottom: 5, margin_top: 5}));
        this.vbox.add(this.addPictureUrl());
        this.vbox.add(this.addPictureShow());

        this.widget.add(this.vbox);
    }

    addSwitch() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
        let setting_label = new Gtk.Label({ label: "Open Unlock Dialog Background", xalign: 0 });
        this.setting_switch = new Gtk.Switch({ active: this.gsettings.get_boolean('switch') });

        this.setting_switch.connect('notify::active', (button) => { this.gsettings.set_boolean('switch', button.active); });

        hbox.pack_start(setting_label, true, true, 0);
        hbox.add(this.setting_switch);

        return hbox;
    }

    addPictureUrl() {
        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
        let setting_label = new Gtk.Label({ label: "Picture", xalign: 0 });
        this.setting_entry = new Gtk.Entry({ hexpand: true, margin_left: 20 });

        this.setting_entry.set_text(this.gsettings.get_string('picture-uri'));
        this.setting_entry.connect('changed', (entry) => { this.gsettings.set_string('picture-uri', entry.get_text()); });

        this.fileChooseButton = new Gtk.Button({ margin_left: 5 });
        this.fileChooseButton.set_label("Browse");
        this.fileChooseButton.connect("clicked", this.showFileChooserDialog.bind(this));


        hbox.pack_start(setting_label, false, true, 0);
        hbox.add(this.setting_entry);
        hbox.add(this.fileChooseButton);

        return hbox;
    }

    showFileChooserDialog() {
        let fileChooser = new Gtk.FileChooserDialog({ title: "Select File" });
        fileChooser.set_transient_for(this.widget.get_parent().get_parent());
        fileChooser.set_default_response(1);

        let filter = new Gtk.FileFilter();
        filter.add_pixbuf_formats();
        fileChooser.filter = filter;

        fileChooser.add_button("Cancel", Gtk.ResponseType.CANCEL);
        fileChooser.add_button("Open", Gtk.ResponseType.ACCEPT);

        let preview_image = new Gtk.Image();
        fileChooser.set_preview_widget(preview_image);

        fileChooser.connect('update-preview', (dialog) => {
            dialog.set_preview_widget_active(false);
            let file = fileChooser.get_file();
            if (file.query_file_type(Gio.FileQueryInfoFlags.NONE, null) == Gio.FileType.DIRECTORY)
                return;
            file = fileChooser.get_uris();
            if (file.length > 0 && file[0].startsWith("file://")) {
                file = decodeURIComponent(file[0].substring(7));
            } else {
                return;
            }
            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(file);
            let maxwidth = 400.0, maxheight = 800.0;
            let width = pixbuf.get_width(), height = pixbuf.get_height();
            let scale = Math.min(maxwidth / width, maxheight / height);
            if (scale < 1) {
                width = width * scale;
                height = height * scale;
                pixbuf = pixbuf.scale_simple(width.toFixed(0), height.toFixed(0), GdkPixbuf.InterpType.BILINEAR);
            }
            preview_image.set_from_pixbuf(pixbuf);
            dialog.set_preview_widget_active(true);
        });

        switch(fileChooser.run()) {
            case Gtk.ResponseType.CANCEL:
                fileChooser.destroy();
                break;
            case Gtk.ResponseType.ACCEPT:
                let file = fileChooser.get_uris();
                if (file.length > 0 && file[0].startsWith("file://"))
                    this.setting_entry.set_text(decodeURIComponent(file[0].substring(7)));
                fileChooser.destroy();
                break;
            default:
        }
    }

    addPictureShow() {
        this.drawArea = new Gtk.DrawingArea({ expand: true });
        this.drawArea.connect('draw', (widget, cr) => {
            let pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_size(this.setting_entry.get_text(),
                                                                -1,
                                                                widget.get_allocated_height());

            this.drawArea.set_size_request(pixbuf.get_width(), -1);

            Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
            cr.paint();
        });

        this.setting_entry.connect('changed', (entry) => {
                                    if (GLib.file_test(entry.get_text(), GLib.FileTest.EXISTS))
                                        this.drawArea.queue_draw();
                                    });

        let hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                                 margin_top: 10,
                                 expand:true,
                                 halign:Gtk.Align.CENTER });

        hbox.add(this.drawArea);

        return hbox;
    }

    addBoldTextToBox(text, box) {
        let txt = new Gtk.Label({xalign: 0, margin_top: 20});
        txt.set_markup('<b>' + text + '</b>');
        txt.set_line_wrap(true);
        box.add(txt);
    }
}

