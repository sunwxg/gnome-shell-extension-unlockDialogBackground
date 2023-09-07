// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as UnlockDialog from 'resource:///org/gnome/shell/ui/unlockDialog.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as BackgroundNew from './backgroundNew.js';

const BLUR_BRIGHTNESS = 0.55;
const BLUR_SIGMA = 60;
const CROSSFADE_TIME = 300;

let dir = null;

function _createBackgroundNew(monitorIndex) {
    let monitor = Main.layoutManager.monitors[monitorIndex];
    let widget = new St.Widget({
        style_class: 'screen-shield-background',
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
        effect: new Shell.BlurEffect({ name: 'blur' }),
    });

    let bgManager = new BackgroundNew.BackgroundManager({
        container: widget,
        monitorIndex,
        controlPosition: false,
        dir: dir,
    });

    this._bgManagers.push(bgManager);

    this._backgroundGroup.add_child(widget);
}

function _showClockNew() {
    if (this._activePage === this._clock)
        return;

    this._activePage = this._clock;

    let children = this._backgroundGroup.get_children();
    children.forEach( child => {
        let effects = child.get_effects();
        if (effects.length > 0) {
            child.myEffect = effects[0];
            child.remove_effect(child.myEffect);
        }
    });

    this._adjustment.ease(0, {
        duration: CROSSFADE_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => this._maybeDestroyAuthPrompt(),
    });
}

function _showPromptNew() {
    this._ensureAuthPrompt();

    if (this._activePage === this._promptBox)
        return;

    this._activePage = this._promptBox;

    let children = this._backgroundGroup.get_children();
    children.forEach( child => {
        if (child.get_effects().length == 0)
            child.add_effect(child.myEffect);
    });

    this._adjustment.ease(1, {
        duration: CROSSFADE_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}

class DialogBackground {
    constructor(settings) {
        this._gsettings = settings;
        this.enabled = false;

        //Background.BackgroundSource = newBackgroundSource;

        //this._createBackgroundManager = Layout.LayoutManager.prototype._createBackgroundManager;
        this._createBackground = UnlockDialog.UnlockDialog.prototype._createBackground;
        this._showClock = UnlockDialog.UnlockDialog.prototype._showClock;
        this._showPrompt = UnlockDialog.UnlockDialog.prototype._showPrompt;
    }

    enable() {
        //Layout.LayoutManager.prototype._createBackgroundManager = _createBackgroundManagerNew;
        UnlockDialog.UnlockDialog.prototype._createBackground = _createBackgroundNew;
        UnlockDialog.UnlockDialog.prototype._showClock = _showClockNew;
        UnlockDialog.UnlockDialog.prototype._showPrompt = _showPromptNew;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();

        this.enabled = true;
    }

    disable() {
        //Layout.LayoutManager.prototype._createBackgroundManager = this._createBackgroundManager
        UnlockDialog.UnlockDialog.prototype._createBackground = this._createBackground;
        UnlockDialog.UnlockDialog.prototype._showClock = this._showClock;
        UnlockDialog.UnlockDialog.prototype._showPrompt = this._showPrompt;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();

        this.enabled = false;
    }
}

export default class PanelScrollExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this.enabled = false;
        this._startupPreparedId = 0;
    }

    enable() {
        this._settings = this.getSettings();

        if (this.enabled)
            return;

        this.background = new DialogBackground();

        if (Main.layoutManager._startingUp)
            this._startupPreparedId = Main.layoutManager.connect('startup-complete', () => this.enableMe());
        else
            this.enableMe();
    }

    disable() {
        // This extension controls the lock screen background, so it cannot be disabled on unlock dialog
        if (!Main.sessionMode.isLocked) {
            this.background.disable();
            this.enabled = false;
            this._settings = null;
            dir = null;

            if (this._startupPreparedId) {
                Main.layoutManager.disconnect(this._startupPreparedId);
                this._startupPreparedId = 0;
            }
        }
    }

    enableMe() {
        if (this._startupPreparedId) {
            Main.layoutManager.disconnect(this._startupPreparedId);
            this._startupPreparedId = 0;
        }

        dir = this.dir;
        this.background.enable();
        this.enabled = true;
    }
}
