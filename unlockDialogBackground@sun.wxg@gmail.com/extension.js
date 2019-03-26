// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
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
const COLOR = 'rgb(50, 50, 50)';

var newBackgroundSource = class extends Background.BackgroundSource {
    constructor(layoutManager, settingsSchema) {
        if (settingsSchema.includes("unlockDialogBackground")) {
            super(layoutManager, 'org.gnome.desktop.background');
            this._settings = Convenience.getSettings(settingsSchema);
        } else
            super(layoutManager, settingsSchema);
    }
};

function _ensureUnlockDialogNew(onPrimary, allowCancel) {
    if (!this._dialog) {
        let constructor = Main.sessionMode.unlockDialog;
        if (!constructor) {
            // This session mode has no locking capabilities
            this.deactivate(true);
            return false;
        }

        this._dialog = new constructor(this._lockDialogGroup);

        if (themeBackground) {
            this._dialog._promptBox.style = 'background-color: rgba(65, 71, 72, 0.5);'
                                            + 'border-radius: 8px;'
                                            + 'border: 8px';
        }

        if (themeTextDark) {
            if (this._dialog._authPrompt._userWell.get_child().get_children().length >=1) {
                //user label
                let userLabel = this._dialog._authPrompt._userWell.get_child().get_children()[1];
                userLabel._userNameLabel.set_style('color: %s;'.format(COLOR));
                userLabel._realNameLabel.set_style('color: %s;'.format(COLOR));

                //user icon
                let userIcon = this._dialog._authPrompt._userWell.get_child().get_children()[0];
                userIcon.set_style('color: %s; border: 2px solid %s;'.format(COLOR, COLOR));
            }

            //password label
            this._dialog._authPrompt._label.set_style('color: %s;'.format(COLOR));

            //other user label
            this._dialog._otherUserButton.get_child().set_style('color:%s;'.format(COLOR));
        }

        let time = global.get_current_time();
        if (!this._dialog.open(time, onPrimary)) {
            // This is kind of an impossible error: we're already modal
            // by the time we reach this...
            log('Could not open login dialog: failed to acquire grab');
            this.deactivate(true);
            return false;
        }

        this._dialog.connect('failed', this._onUnlockFailed.bind(this));
    }

    this._dialog.allowCancel = allowCancel;
    return true;
}

class DialogBackground {
    constructor() {
        this._gsettings = Convenience.getSettings(BACKGROUND_SCHEMA);

        Background.BackgroundSource = newBackgroundSource;

        this._ensureUnlockDialogOrigin = Main.screenShield._ensureUnlockDialog;

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
            Main.screenShield._ensureUnlockDialog = _ensureUnlockDialogNew;
            Main.screenShield._backgroundDialogGroup = new Clutter.Actor();
            Main.screenShield._lockDialogGroup.add_actor(Main.screenShield._backgroundDialogGroup);
            Main.screenShield._backgroundDialogGroup.lower_bottom();
            Main.screenShield._bgDialogManagers = [];

            this._updateDialogBackgrounds();
            this._updateDialogBackgroundId = Main.layoutManager.connect('monitors-changed', this._updateDialogBackgrounds.bind(this));
        } else {
            Main.screenShield._ensureUnlockDialog = this._ensureUnlockDialogOrigin;

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
let themeBackground;
let themeTextDark;
let gsettings;

function init() {
    gsettings = Convenience.getSettings(BACKGROUND_SCHEMA);

    themeTextDark = gsettings.get_boolean('theme-text-dark');
    themeBackground = gsettings.get_boolean('theme-background');

    gsettings.connect("changed::theme-background", () => { themeBackground = gsettings.get_boolean('theme-background'); });
    gsettings.connect("changed::theme-text-dark", () => { themeTextDark = gsettings.get_boolean('theme-text-dark'); });

    background = new DialogBackground();
}

function enable() {
}

function disable() {
}
