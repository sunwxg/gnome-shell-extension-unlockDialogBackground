// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Background = imports.ui.background;
const ScreenShield = imports.ui.screenShield;
const Meta = imports.gi.Meta;

const BACKGROUND_SCHEMA = 'org.gnome.shell.extensions.unlockDialogBackground';

function newInit(layoutManager, settingsSchema) {
    // Allow override the background image setting for performance testing
    this._layoutManager = layoutManager;
    this._overrideImage = GLib.getenv('SHELL_BACKGROUND_IMAGE');

    if (settingsSchema.includes("unlockDialogBackground"))
        this._settings = Convenience.getSettings(settingsSchema);
    else
        this._settings = new Gio.Settings({ schema_id: settingsSchema });

    this._backgrounds = [];

    let monitorManager = Meta.MonitorManager.get();
    this._monitorsChangedId =
        monitorManager.connect('monitors-changed',
                               this._onMonitorsChanged.bind(this));
}

class DialogBackground {
    constructor() {
        this._gsettings = Convenience.getSettings(BACKGROUND_SCHEMA);

        Background.BackgroundSource.prototype._init = newInit;

        this.connect_signal();
        this._switchChanged();
    }

    _createDialogBackground(monitorIndex) {
        let monitor = Main.layoutManager.monitors[monitorIndex];
        let widget = new St.Widget({ style_class: 'screen-shield-background',
                                     x: monitor.x,
                                     y: monitor.y,
                                     width: monitor.width,
                                     height: monitor.height });

        let bgManager = new Background.BackgroundManager({ container: widget,
                                                           monitorIndex: monitorIndex,
                                                           controlPosition: false,
                                                           settingsSchema: BACKGROUND_SCHEMA });

        Main.screenShield._bgDialogManagers.push(bgManager);

        Main.screenShield._backgroundDialogGroup.add_child(widget);
    }

    _updateDialogBackgrounds() {
        for (let i = 0; i < Main.screenShield._bgDialogManagers.length; i++)
            Main.screenShield._bgDialogManagers[i].destroy();

        Main.screenShield._bgDialogManagers = [];
        Main.screenShield._backgroundDialogGroup.destroy_all_children();

        for (let i = 0; i < Main.layoutManager.monitors.length; i++)
            this._createDialogBackground(i);
    }

    _switchChanged() {
        this._enable = this._gsettings.get_boolean('switch');
        if (this._enable) {
            Main.screenShield._backgroundDialogGroup = new Clutter.Actor();
            Main.screenShield._lockDialogGroup.add_actor(Main.screenShield._backgroundDialogGroup);
            Main.screenShield._backgroundDialogGroup.lower_bottom();
            Main.screenShield._bgDialogManagers = [];

            this._updateDialogBackgrounds();
            this._updateDialogBackgroundId = Main.layoutManager.connect('monitors-changed', this._updateDialogBackgrounds.bind(this));
        } else {
            if (Main.screenShield._backgroundDialogGroup == null)
                return;

            for (let i = 0; i < Main.screenShield._bgDialogManagers.length; i++)
                Main.screenShield._bgDialogManagers[i].destroy();

            Main.screenShield._bgDialogManagers = [];
            Main.screenShield._backgroundDialogGroup.destroy_all_children();
            Main.screenShield._backgroundDialogGroup.destroy();
            Main.screenShield._backgroundDialogGroup = null;

            if (this._updateDialogBackgroundId != null) {
                Main.layoutManager.disconnect(this._updateDialogBackgroundId);
                this._updateDialogBackgroundId = null;
            }
        }
    }

    connect_signal() {
        this._gsettings.connect("changed::switch", this._switchChanged.bind(this));
    }

}

let background;

function init() {
    background = new DialogBackground();
}

function enable() {
}

function disable() {
}
