// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import Clutter from 'gi://Clutter';
import GDesktopEnums from 'gi://GDesktopEnums';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GnomeBG from 'gi://GnomeBG';
import GnomeDesktop from 'gi://GnomeDesktop';
import Meta from 'gi://Meta';
import Cogl from 'gi://Cogl';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

const BACKGROUND_SCHEMA = 'org.gnome.shell.extensions.unlockDialogBackground';
//const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';
const PRIMARY_COLOR_KEY = 'primary-color';
const SECONDARY_COLOR_KEY = 'secondary-color';
const COLOR_SHADING_TYPE_KEY = 'color-shading-type';
const BACKGROUND_STYLE_KEY = 'picture-options';
const PICTURE_URI_KEY = 'picture-uri';
const PICTURE_URI_DARK_KEY = 'picture-uri-dark';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const COLOR_SCHEME_KEY = 'color-scheme';

const FADE_ANIMATION_TIME = 1000;

// These parameters affect how often we redraw.
// The first is how different (percent crossfaded) the slide show
// has to look before redrawing and the second is the minimum
// frequency (in seconds) we're willing to wake up
const ANIMATION_OPACITY_STEP_INCREMENT = 4.0;
const ANIMATION_MIN_WAKEUP_INTERVAL = 1.0;

let _backgroundCache = null;

function _fileEqual0(file1, file2) {
    if (file1 === file2)
        return true;

    if (!file1 || !file2)
        return false;

    return file1.equal(file2);
}

class BackgroundCache extends Signals.EventEmitter {
    constructor() {
        super();

        this._fileMonitors = {};
        this._backgroundSources = {};
        this._animations = {};
    }

    monitorFile(file) {
        let key = file.hash();
        if (this._fileMonitors[key])
            return;

        let monitor = file.monitor(Gio.FileMonitorFlags.NONE, null);
        monitor.connect('changed',
            (obj, theFile, otherFile, eventType) => {
                // Ignore CHANGED and CREATED events, since in both cases
                // we'll get a CHANGES_DONE_HINT event when done.
                if (eventType !== Gio.FileMonitorEvent.CHANGED &&
                    eventType !== Gio.FileMonitorEvent.CREATED)
                    this.emit('file-changed', file);
            });

        this._fileMonitors[key] = monitor;
    }

    getAnimation(params) {
        params = Params.parse(params, {
            file: null,
            settingsSchema: null,
            onLoaded: null,
        });

        let animation = this._animations[params.settingsSchema];
        if (animation && _fileEqual0(animation.file, params.file)) {
            if (params.onLoaded) {
                this.onLoadedId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    params.onLoaded(this._animations[params.settingsSchema]);
                    this.onLoadedId = 0;
                    return GLib.SOURCE_REMOVE;
                });
                GLib.Source.set_name_by_id(this.onLoadedId, '[gnome-shell] params.onLoaded');
            }
            return;
        }

        animation = new Animation({file: params.file});

        animation.load_async(null, () => {
            this._animations[params.settingsSchema] = animation;

            if (params.onLoaded) {
                this.onLoadedId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    params.onLoaded(this._animations[params.settingsSchema]);
                    this.onLoadedId = 0;
                    return GLib.SOURCE_REMOVE;
                });
                GLib.Source.set_name_by_id(this.onLoadedId, '[gnome-shell] params.onLoaded');
            }
        });
    }

    getBackgroundSource(layoutManager, settingsSchema, dir) {
        // The layoutManager is always the same one; we pass in it since
        // Main.layoutManager may not be set yet

        if (!(settingsSchema in this._backgroundSources)) {
            this._backgroundSources[settingsSchema] = new BackgroundSource(layoutManager, settingsSchema, dir);
            this._backgroundSources[settingsSchema]._useCount = 1;
        } else {
            this._backgroundSources[settingsSchema]._useCount++;
        }

        return this._backgroundSources[settingsSchema];
    }

    releaseBackgroundSource(settingsSchema) {
        if (this.onLoadedId) {
            GLib.source_remove(this.onLoadedId);
            this.onLoadedId = 0;
        }

        if (settingsSchema in this._backgroundSources) {
            let source = this._backgroundSources[settingsSchema];
            source._useCount--;
            if (source._useCount === 0) {
                delete this._backgroundSources[settingsSchema];
                source.destroy();
            }
        }
    }
}

/**
 * @returns {BackgroundCache}
 */
function getBackgroundCache() {
    if (!_backgroundCache)
        _backgroundCache = new BackgroundCache();
    return _backgroundCache;
}

const Background = GObject.registerClass({
    Signals: {'loaded': {}, 'bg-changed': {}},
}, class Background extends Meta.Background {
    _init(params) {
        params = Params.parse(params, {
            monitorIndex: 0,
            layoutManager: Main.layoutManager,
            settings: null,
            file: null,
            style: null,
        });

        super._init({meta_display: global.display});

        this._settings = params.settings;
        this._file = params.file;
        this._style = params.style;
        this._monitorIndex = params.monitorIndex;
        this._layoutManager = params.layoutManager;
        this._fileWatches = {};
        this._cancellable = new Gio.Cancellable();
        this.isLoaded = false;

        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});

        this._clock = new GnomeDesktop.WallClock();
        this._clock.connectObject('notify::timezone',
            () => {
                if (this._animation)
                    this._loadAnimation(this._animation.file);
            }, this);

        let loginManager = LoginManager.getLoginManager();
        loginManager.connectObject('prepare-for-sleep',
            (lm, aboutToSuspend) => {
                if (aboutToSuspend)
                    return;
                this._refreshAnimation();
            }, this);

        this._settings.connectObject('changed',
            this._emitChangedSignal.bind(this), this);

        this._interfaceSettings.connectObject(`changed::${COLOR_SCHEME_KEY}`,
            this._emitChangedSignal.bind(this), this);

        this._load();
    }

    destroy() {
        this._cancellable.cancel();
        this._removeAnimationTimeout();

        let i;
        let keys = Object.keys(this._fileWatches);
        for (i = 0; i < keys.length; i++)
            this._cache.disconnect(this._fileWatches[keys[i]]);

        this._fileWatches = null;

        this._clock.disconnectObject(this);
        this._clock = null;

        LoginManager.getLoginManager().disconnectObject(this);
        this._settings.disconnectObject(this);
        this._interfaceSettings.disconnectObject(this);

        if (this._changedIdleId) {
            GLib.source_remove(this._changedIdleId);
            this._changedIdleId = 0;
        }
        if (this._setLoadedId) {
            GLib.source_remove(this._setLoadedId);
            this._setLoadedId = 0;
        }
    }

    _emitChangedSignal() {
        if (this._changedIdleId)
            return;

        this._changedIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._changedIdleId = 0;
            this.emit('bg-changed');
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._changedIdleId,
            '[gnome-shell] Background._emitChangedSignal');
    }

    updateResolution() {
        if (this._animation)
            this._refreshAnimation();
    }

    _refreshAnimation() {
        if (!this._animation)
            return;

        this._removeAnimationTimeout();
        this._updateAnimation();
    }

    _setLoaded() {
        if (this.isLoaded)
            return;

        this.isLoaded = true;
        if (this._cancellable?.is_cancelled())
            return;

        this._setLoadedId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._setLoadedId = 0;
            this.emit('loaded');
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._setLoadedId, '[gnome-shell] Background._setLoaded Idle');
    }

    _loadPattern() {
        let colorString, res_, color, secondColor;

        colorString = this._settings.get_string(PRIMARY_COLOR_KEY);
        [res_, color] = Cogl.Color.from_string(colorString);
        colorString = this._settings.get_string(SECONDARY_COLOR_KEY);
        [res_, secondColor] = Cogl.Color.from_string(colorString);

        let shadingType = this._settings.get_enum(COLOR_SHADING_TYPE_KEY);

        if (shadingType === GDesktopEnums.BackgroundShading.SOLID)
            this.set_color(color);
        else
            this.set_gradient(shadingType, color, secondColor);
    }

    _watchFile(file) {
        let key = file.hash();
        if (this._fileWatches[key])
            return;

        this._cache.monitorFile(file);
        let signalId = this._cache.connect('file-changed',
            (cache, changedFile) => {
                if (changedFile.equal(file)) {
                    let imageCache = Meta.BackgroundImageCache.get_default();
                    imageCache.purge(changedFile);
                    this._emitChangedSignal();
                }
            });
        this._fileWatches[key] = signalId;
    }

    _removeAnimationTimeout() {
        if (this._updateAnimationTimeoutId) {
            GLib.source_remove(this._updateAnimationTimeoutId);
            this._updateAnimationTimeoutId = 0;
        }
    }

    _updateAnimation() {
        this._updateAnimationTimeoutId = 0;

        this._animation.update(this._layoutManager.monitors[this._monitorIndex]);
        let files = this._animation.keyFrameFiles;

        let finish = () => {
            this._setLoaded();
            if (files.length > 1) {
                this.set_blend(files[0], files[1],
                    this._animation.transitionProgress,
                    this._style);
            } else if (files.length > 0) {
                this.set_file(files[0], this._style);
            } else {
                this.set_file(null, this._style);
            }
            this._queueUpdateAnimation();
        };

        let cache = Meta.BackgroundImageCache.get_default();
        let numPendingImages = files.length;
        for (let i = 0; i < files.length; i++) {
            this._watchFile(files[i]);
            let image = cache.load(files[i]);
            if (image.is_loaded()) {
                numPendingImages--;
                if (numPendingImages === 0)
                    finish();
            } else {
                // eslint-disable-next-line no-loop-func
                let id = image.connect('loaded', () => {
                    image.disconnect(id);
                    numPendingImages--;
                    if (numPendingImages === 0)
                        finish();
                });
            }
        }
    }

    _queueUpdateAnimation() {
        if (this._updateAnimationTimeoutId !== 0)
            return;

        if (!this._cancellable || this._cancellable.is_cancelled())
            return;

        if (!this._animation.transitionDuration)
            return;

        let nSteps = 255 / ANIMATION_OPACITY_STEP_INCREMENT;
        let timePerStep = (this._animation.transitionDuration * 1000) / nSteps;

        let interval = Math.max(
            ANIMATION_MIN_WAKEUP_INTERVAL * 1000,
            timePerStep);

        if (interval > GLib.MAXUINT32)
            return;

        this._updateAnimationTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            interval,
            () => {
                this._updateAnimationTimeoutId = 0;
                this._updateAnimation();
                return GLib.SOURCE_REMOVE;
            });
        GLib.Source.set_name_by_id(this._updateAnimationTimeoutId, '[gnome-shell] this._updateAnimation');
    }

    _loadAnimation(file) {
        this._cache.getAnimation({
            file,
            settingsSchema: this._settings.schema_id,
            onLoaded: animation => {
                this._animation = animation;

                if (!this._animation || this._cancellable.is_cancelled()) {
                    this._setLoaded();
                    return;
                }

                this._updateAnimation();
                this._watchFile(file);
            },
        });
    }

    _loadImage(file) {
        this.set_file(file, this._style);
        this._watchFile(file);

        let cache = Meta.BackgroundImageCache.get_default();
        let image = cache.load(file);
        if (image.is_loaded()) {
            this._setLoaded();
        } else {
            let id = image.connect('loaded', () => {
                this._setLoaded();
                image.disconnect(id);
            });
        }
    }

    async _loadFile(file) {
        let info;
        try {
            info = await file.query_info_async(
                Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE,
                Gio.FileQueryInfoFlags.NONE,
                0,
                this._cancellable);
        } catch (e) {
            this._setLoaded();
            return;
        }

        const contentType = info.get_content_type();
        if (contentType === 'application/xml')
            this._loadAnimation(file);
        else
            this._loadImage(file);
    }

    _load() {
        this._cache = getBackgroundCache();

        this._loadPattern();

        if (!this._file) {
            this._setLoaded();
            return;
        }

        this._loadFile(this._file);
    }
});

class BackgroundSource {
    constructor(layoutManager, settingsSchema, dir) {
        // Allow override the background image setting for performance testing
        this._layoutManager = layoutManager;
        this._overrideImage = GLib.getenv('SHELL_BACKGROUND_IMAGE');

        const schemaDir = dir.get_child('schemas');
        const defaultSource = Gio.SettingsSchemaSource.get_default();
        let schemaSource = Gio.SettingsSchemaSource.new_from_directory(
                schemaDir.get_path(), defaultSource, false);
        const schemaObj = schemaSource.lookup(settingsSchema, true);
        if (!schemaObj)
            throw new Error(`Schema ${settingsSchema} could not be found for extension ${this.uuid}. Please check your installation`);

        this._settings = new Gio.Settings({settings_schema: schemaObj});

        this._backgrounds = [];

        const monitorManager = global.backend.get_monitor_manager();
        this._monitorsChangedId =
            monitorManager.connect('monitors-changed',
                this._onMonitorsChanged.bind(this));

        this._interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    }

    _onMonitorsChanged() {
        for (let monitorIndex in this._backgrounds) {
            let background = this._backgrounds[monitorIndex];

            if (monitorIndex < this._layoutManager.monitors.length) {
                background.updateResolution();
            } else {
                background.disconnect(background._changedId);
                background.destroy();
                delete this._backgrounds[monitorIndex];
            }
        }
    }

    getBackground(monitorIndex) {
        let file = null;
        let style;

        // We don't watch changes to settings here,
        // instead we rely on Background to watch those
        // and emit 'bg-changed' at the right time

        if (this._overrideImage != null) {
            file = Gio.File.new_for_path(this._overrideImage);
            style = GDesktopEnums.BackgroundStyle.ZOOM; // Hardcode
        } else {
            style = this._settings.get_enum(BACKGROUND_STYLE_KEY);
            if (style !== GDesktopEnums.BackgroundStyle.NONE) {
                const colorScheme = this._interfaceSettings.get_enum('color-scheme');
                const uri = this._settings.get_string(
                    colorScheme === GDesktopEnums.ColorScheme.PREFER_DARK
                        ? PICTURE_URI_DARK_KEY
                        : PICTURE_URI_KEY);

                file = Gio.File.new_for_commandline_arg(uri);
            }
        }

        // Animated backgrounds are (potentially) per-monitor, since
        // they can have variants that depend on the aspect ratio and
        // size of the monitor; for other backgrounds we can use the
        // same background object for all monitors.
        if (file == null || !file.get_basename().endsWith('.xml'))
            monitorIndex = 0;

        if (!(monitorIndex in this._backgrounds)) {
            let background = new Background({
                monitorIndex,
                layoutManager: this._layoutManager,
                settings: this._settings,
                file,
                style,
            });

            background._changedId = background.connect('bg-changed', () => {
                background.disconnect(background._changedId);
                background.destroy();
                delete this._backgrounds[monitorIndex];
            });

            this._backgrounds[monitorIndex] = background;
        }

        return this._backgrounds[monitorIndex];
    }

    destroy() {
        const monitorManager = global.backend.get_monitor_manager();
        monitorManager.disconnect(this._monitorsChangedId);

        for (let monitorIndex in this._backgrounds) {
            let background = this._backgrounds[monitorIndex];
            background.disconnect(background._changedId);
            background.destroy();
        }

        this._backgrounds = null;
    }
}

const Animation = GObject.registerClass(
class Animation extends GnomeBG.BGSlideShow {
    _init(params) {
        super._init(params);

        this.keyFrameFiles = [];
        this.transitionProgress = 0.0;
        this.transitionDuration = 0.0;
        this.loaded = false;
    }

    // eslint-disable-next-line camelcase
    load_async(cancellable, callback) {
        super.load_async(cancellable, () => {
            this.loaded = true;

            callback?.();
        });
    }

    update(monitor) {
        this.keyFrameFiles = [];

        if (this.get_num_slides() < 1)
            return;

        let [progress, duration, isFixed_, filename1, filename2] =
            this.get_current_slide(monitor.width, monitor.height);

        this.transitionDuration = duration;
        this.transitionProgress = progress;

        if (filename1)
            this.keyFrameFiles.push(Gio.File.new_for_path(filename1));

        if (filename2)
            this.keyFrameFiles.push(Gio.File.new_for_path(filename2));
    }
});

export class BackgroundManager extends Signals.EventEmitter {
    constructor(params) {
        super();
        params = Params.parse(params, {
            container: null,
            layoutManager: Main.layoutManager,
            monitorIndex: null,
            vignette: false,
            controlPosition: true,
            settingsSchema: BACKGROUND_SCHEMA,
            useContentSize: true,
            dir: null,
        });

        let cache = getBackgroundCache();
        this._settingsSchema = params.settingsSchema;
        this._backgroundSource = cache.getBackgroundSource(params.layoutManager, params.settingsSchema, params.dir);

        this._container = params.container;
        this._layoutManager = params.layoutManager;
        this._vignette = params.vignette;
        this._monitorIndex = params.monitorIndex;
        this._controlPosition = params.controlPosition;
        this._useContentSize = params.useContentSize;

        this.backgroundActor = this._createBackgroundActor();
        this._newBackgroundActor = null;
    }

    destroy() {
        let cache = getBackgroundCache();
        cache.releaseBackgroundSource(this._settingsSchema);
        this._backgroundSource = null;

        if (this._newBackgroundActor) {
            this._newBackgroundActor.destroy();
            this._newBackgroundActor = null;
        }

        if (this.backgroundActor) {
            this.backgroundActor.destroy();
            this.backgroundActor = null;
        }
    }

    _swapBackgroundActor() {
        let oldBackgroundActor = this.backgroundActor;
        this.backgroundActor = this._newBackgroundActor;
        this._newBackgroundActor = null;
        this.emit('changed');

        if (Main.layoutManager.screenTransition.visible) {
            oldBackgroundActor.destroy();
            return;
        }

        oldBackgroundActor.ease({
            opacity: 0,
            duration: FADE_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => oldBackgroundActor.destroy(),
        });
    }

    _updateBackgroundActor() {
        if (this._newBackgroundActor) {
            /* Skip displaying existing background queued for load */
            this._newBackgroundActor.destroy();
            this._newBackgroundActor = null;
        }

        let newBackgroundActor = this._createBackgroundActor();

        const oldContent = this.backgroundActor.content;
        const newContent = newBackgroundActor.content;

        newContent.vignette_sharpness = oldContent.vignette_sharpness;
        newContent.brightness = oldContent.brightness;

        newBackgroundActor.visible = this.backgroundActor.visible;

        this._newBackgroundActor = newBackgroundActor;

        const {background} = newBackgroundActor.content;

        if (background.isLoaded) {
            this._swapBackgroundActor();
        } else {
            newBackgroundActor.loadedSignalId = background.connect('loaded',
                () => {
                    background.disconnect(newBackgroundActor.loadedSignalId);
                    newBackgroundActor.loadedSignalId = 0;

                    this._swapBackgroundActor();
                });
        }
    }

    _createBackgroundActor() {
        let background = this._backgroundSource.getBackground(this._monitorIndex);
        let backgroundActor = new Meta.BackgroundActor({
            meta_display: global.display,
            monitor: this._monitorIndex,
            request_mode: this._useContentSize
                ? Clutter.RequestMode.CONTENT_SIZE
                : Clutter.RequestMode.HEIGHT_FOR_WIDTH,
            x_expand: !this._useContentSize,
            y_expand: !this._useContentSize,
        });
        backgroundActor.content.set({
            background,
            vignette: this._vignette,
            vignette_sharpness: 0.5,
            brightness: 0.5,
        });

        this._container.add_child(backgroundActor);

        if (this._controlPosition) {
            let monitor = this._layoutManager.monitors[this._monitorIndex];
            backgroundActor.set_position(monitor.x, monitor.y);
            this._container.set_child_below_sibling(backgroundActor, null);
        }

        let changeSignalId = background.connect('bg-changed', () => {
            background.disconnect(changeSignalId);
            changeSignalId = null;
            this._updateBackgroundActor();
        });

        let loadedSignalId;
        if (background.isLoaded) {
            this.loadedSignalId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this.loadedSignalId = 0;
                this.emit('loaded');
                return GLib.SOURCE_REMOVE;
            });
            GLib.Source.set_name_by_id(this.loadedSignalId, '[gnome-shell] isLoaded');
        } else {
            loadedSignalId = background.connect('loaded', () => {
                background.disconnect(loadedSignalId);
                loadedSignalId = null;
                this.emit('loaded');
            });
        }

        backgroundActor.connect('destroy', () => {
            if (this.loadedSignalId) {
                GLib.source_remove(this.loadedSignalId);
                this.loadedSignalId = 0;
            }

            if (changeSignalId)
                background.disconnect(changeSignalId);

            if (loadedSignalId)
                background.disconnect(loadedSignalId);

            if (backgroundActor.loadedSignalId)
                background.disconnect(backgroundActor.loadedSignalId);
        });

        return backgroundActor;
    }
}
