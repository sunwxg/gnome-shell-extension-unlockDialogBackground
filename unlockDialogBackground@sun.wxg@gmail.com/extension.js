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
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as BackgroundNew from './backgroundNew.js';
import { UnlockDialog } from 'resource:///org/gnome/shell/ui/unlockDialog.js';

const CROSSFADE_TIME = 300;
const DEFAULT_SIGMA = 30;
const DEFAULT_BRIGHTNESS = 0.65;
const KEY_SIGMA = 'sigma';
const KEY_BRIGHTNESS = 'brightness';

let dir = null;
let sigma;
let brightness;

function _createBackgroundNew(monitorIndex) {
    let monitor = Main.layoutManager.monitors[monitorIndex];
    let widget = new St.Widget({
        style_class: 'screen-shield-background',
        x: monitor.x,
        y: monitor.y,
        width: monitor.width,
        height: monitor.height,
    });

    let blur_effect = new Shell.BlurEffect({
        name: 'blur',
        sigma: sigma,
        brightness: brightness,
    });
    blur_effect.set_enabled(false);
    widget.add_effect(blur_effect);

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

    for (const widget of this._backgroundGroup) {
        const blur_effect = widget.get_effect('blur');
        blur_effect.set_enabled(true);
        if (blur_effect) {
            blur_effect.set({
                sigma: sigma,
                brightness: brightness,
            });
        }
    }

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

    for (const widget of this._backgroundGroup) {
        const blur_effect = widget.get_effect('blur');
        blur_effect.set_enabled(true);
        if (blur_effect) {
            blur_effect.set({
                sigma: DEFAULT_SIGMA,
                brightness: DEFAULT_BRIGHTNESS,
            });
        }
    }

    this._adjustment.ease(1, {
        duration: CROSSFADE_TIME,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
}

class DialogBackground {
    constructor(settings) {
        this.settings = settings;

        this._createBackground = UnlockDialog.prototype._createBackground;
        this._showClock = UnlockDialog.prototype._showClock;
        this._showPrompt = UnlockDialog.prototype._showPrompt;

        sigma = this.settings.get_int(KEY_SIGMA);
        this.sigmaID = this.settings.connect("changed::" + KEY_SIGMA, () => {
            sigma = this.settings.get_int(KEY_SIGMA);
        })
        brightness = this.settings.get_double(KEY_BRIGHTNESS);
        this.brightnessID = this.settings.connect("changed::" + KEY_BRIGHTNESS, () => {
            brightness = this.settings.get_double(KEY_BRIGHTNESS);
        })
    }

    enable() {
        UnlockDialog.prototype._createBackground = _createBackgroundNew;
        UnlockDialog.prototype._showClock = _showClockNew;
        UnlockDialog.prototype._showPrompt = _showPromptNew;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();
    }

    disable() {
        UnlockDialog.prototype._createBackground = this._createBackground;
        UnlockDialog.prototype._showClock = this._showClock;
        UnlockDialog.prototype._showPrompt = this._showPrompt;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();

        if (this.sigmaID)
            this.settings.disconnect(this.sigmaID);

        if (this.brightnessID)
            this.settings.disconnect(this.brightnessID);
    }
}

export default class unlockDialogBackgroundExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        this._startupPreparedId = 0;
    }

    enable() {
        dir = this.dir;
        this.background = new DialogBackground(this.getSettings());

        if (Main.layoutManager._startingUp)
            this._startupPreparedId = Main.layoutManager.connect('startup-complete', () => this.enableMe());
        else
            this.enableMe();
    }

    disable() {
        // This extension controls the lock screen background, so it cannot be disabled on unlock dialog
        this.background.disable();
        dir = null;

        if (this._startupPreparedId) {
            Main.layoutManager.disconnect(this._startupPreparedId);
            this._startupPreparedId = 0;
        }
    }

    enableMe() {
        if (this._startupPreparedId) {
            Main.layoutManager.disconnect(this._startupPreparedId);
            this._startupPreparedId = 0;
        }

        this.background.enable();
    }
}
