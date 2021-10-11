// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const { Clutter, Gio, GLib, Shell, St, Gdk, Gtk } = imports.gi;

const Main = imports.ui.main;
const UnlockDialog = imports.ui.unlockDialog

const ExtensionUtils = imports.misc.extensionUtils;

const Background = imports.ui.background;
const ScreenShield = imports.ui.screenShield;

const BLUR_BRIGHTNESS = 0.55;
const BLUR_SIGMA = 60;
const CROSSFADE_TIME = 300;

const BACKGROUND_SCHEMA = 'org.gnome.shell.extensions.unlockDialogBackground';

var newBackgroundSource = class extends Background.BackgroundSource {
    constructor(layoutManager, settingsSchema) {
        if (settingsSchema.includes("unlockDialogBackground")) {
            super(layoutManager, 'org.gnome.desktop.background');
            this._settings = ExtensionUtils.getSettings(settingsSchema);
        } else
            super(layoutManager, settingsSchema);
    }
};

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

    let bgManager = new Background.BackgroundManager({
        container: widget,
        monitorIndex,
        controlPosition: false,
        settingsSchema: BACKGROUND_SCHEMA,
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
    constructor() {
        this._gsettings = ExtensionUtils.getSettings(BACKGROUND_SCHEMA);
        this.enabled = false;

        Background.BackgroundSource = newBackgroundSource;

        this._createBackground = UnlockDialog.UnlockDialog.prototype._createBackground;
        this._showClock = UnlockDialog.UnlockDialog.prototype._showClock;
        this._showPrompt = UnlockDialog.UnlockDialog.prototype._showPrompt;
    }

    enable() {
        UnlockDialog.UnlockDialog.prototype._createBackground = _createBackgroundNew;
        UnlockDialog.UnlockDialog.prototype._showClock = _showClockNew;
        UnlockDialog.UnlockDialog.prototype._showPrompt = _showPromptNew;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();

        this.enabled = true;
    }

    disable() {
        UnlockDialog.UnlockDialog.prototype._createBackground = this._createBackground;
        UnlockDialog.UnlockDialog.prototype._showClock = this._showClock;
        UnlockDialog.UnlockDialog.prototype._showPrompt = this._showPrompt;

        if (Main.screenShield._dialog)
            Main.screenShield._dialog._updateBackgrounds();

        this.enabled = false;
    }
}

let background;
let _startupPreparedId;
let enabled = false;

function enableMe() {
    if (_startupPreparedId) {
        Main.layoutManager.disconnect(_startupPreparedId);
        _startupPreparedId = 0;
    }

    background.enable();
    enabled = true;
}

function init() {
}

function enable() {
    if (enabled)
        return;

    background = new DialogBackground();

    if (Main.layoutManager._startingUp)
        _startupPreparedId = Main.layoutManager.connect('startup-complete', () => enableMe());
    else
        enableMe();
}

function disable() {
    if (!Main.sessionMode.isLocked) {
        background.disable();
        background = null;
        enabled = false;
    }
}

