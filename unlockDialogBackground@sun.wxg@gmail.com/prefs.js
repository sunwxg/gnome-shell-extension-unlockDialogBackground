import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const HELPER_NAME = 'unlockDialogBackground-gdm-helper';
const HELPER_PATH = `/usr/local/bin/${HELPER_NAME}`;

export default class UnlockDialogBackgroundPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._window = window;
        this._settings = this.getSettings();
        this._helperSource = GLib.build_filenamev([this.dir.get_path(), 'gdm-helper']);

        const page = new Adw.PreferencesPage();
        window.add(page);
        window.set_default_size(550, 780);

        this._buildBackgroundGroup(page);
        this._gdmGroup = new Adw.PreferencesGroup({
            title: 'GDM Login Screen',
            description: 'Login screen shown after reboot or logout. Separate from the lock screen above.',
        });
        page.add(this._gdmGroup);
        this._rebuildGdmGroup();
    }

    _buildBackgroundGroup(page) {
        const settings = this._settings;
        const group = new Adw.PreferencesGroup({title: 'Change background'});
        page.add(group);

        const blurRow = new Adw.ActionRow({title: 'Adjust Radius'});
        const blurAdjustment = new Gtk.Adjustment({
            lower: 0,
            'step-increment': 1,
            'page-increment': 5,
            upper: 100,
        });
        settings.bind('radius', blurAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const blurScale = new Gtk.Scale({
            hexpand: true,
            'draw-value': true,
            'value-pos': 'left',
            'can-focus': true,
            digits: 0,
            valign: Gtk.Align.CENTER,
            adjustment: blurAdjustment,
        });
        blurRow.add_suffix(blurScale);
        group.add(blurRow);

        const brightnessRow = new Adw.ActionRow({title: 'Adjust Brightness'});
        const brightnessAdjustment = new Gtk.Adjustment({
            lower: 0,
            'step-increment': 0.05,
            'page-increment': 0.1,
            upper: 1,
        });
        settings.bind('brightness', brightnessAdjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        const brightnessScale = new Gtk.Scale({
            hexpand: true,
            'draw-value': true,
            'value-pos': 'left',
            'can-focus': true,
            digits: 2,
            valign: Gtk.Align.CENTER,
            adjustment: brightnessAdjustment,
        });
        brightnessRow.add_suffix(brightnessScale);
        group.add(brightnessRow);

        const pictureRow = new Adw.EntryRow({title: 'Picture'});
        const browseButton = new Gtk.Button({
            icon_name: 'document-open-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Browse',
        });
        browseButton.connect('clicked', () => this._choosePicture(this._window, pictureRow));
        pictureRow.add_suffix(browseButton);

        const preview = new Gtk.Picture({
            content_fit: Gtk.ContentFit.CONTAIN,
            can_shrink: true,
            vexpand: true,
            height_request: 250,
        });

        const updatePreview = () => {
            const path = pictureRow.get_text();
            preview.set_filename(GLib.file_test(path, GLib.FileTest.EXISTS) ? path : null);
        };

        pictureRow.set_text(settings.get_string('picture-uri-dark'));
        pictureRow.connect('changed', () => {
            const text = pictureRow.get_text();
            settings.set_string('picture-uri', text);
            settings.set_string('picture-uri-dark', text);
            updatePreview();
        });
        group.add(pictureRow);
        group.add(preview);
        updatePreview();
    }

    _clearGroup(group) {
        let child = group.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            group.remove(child);
            child = next;
        }
    }

    _isHelperInstalled() {
        return GLib.file_test(HELPER_PATH, GLib.FileTest.IS_EXECUTABLE);
    }

    _rebuildGdmGroup() {
        this._clearGroup(this._gdmGroup);

        if (!this._isHelperInstalled()) {
            this._buildGdmInstallUi();
            return;
        }

        this._buildGdmManageUi();
    }

    _buildGdmInstallUi() {
        const statusRow = new Adw.ActionRow({
            title: 'Helper not installed yet',
            subtitle: 'One-time system install is required so the login screen can use your image after reboot.',
        });
        this._gdmGroup.add(statusRow);

        const installButton = new Gtk.Button({
            label: 'Install Helper…',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        const installRow = new Adw.ActionRow({
            title: 'Install with system password',
            subtitle: 'Opens the standard authentication dialog (pkexec).',
        });
        installRow.add_suffix(installButton);
        installRow.activatable_widget = installButton;
        this._gdmGroup.add(installRow);

        installButton.connect('clicked', () => this._installHelper());

        const copyButton = new Gtk.Button({
            label: 'Copy Command',
            valign: Gtk.Align.CENTER,
        });
        const copyRow = new Adw.ActionRow({
            title: 'Or copy a terminal command',
            subtitle: this._installCommand(),
        });
        copyRow.add_suffix(copyButton);
        copyRow.activatable_widget = copyButton;
        this._gdmGroup.add(copyRow);

        copyButton.connect('clicked', () => {
            this._copyToClipboard(this._installCommand());
            this._showToast('Install command copied to clipboard');
        });
    }

    _buildGdmManageUi() {
        const gdmStatus = this._getGdmStatus();

        const statusRow = new Adw.ActionRow({
            title: 'Status',
            subtitle: gdmStatus === 'SET'
                ? 'Custom login background is active (same image on each monitor). Log out or reboot to verify.'
                : 'Helper installed. Login background not set yet.',
        });
        this._gdmGroup.add(statusRow);

        const setButton = new Gtk.Button({
            label: 'Set Login Background',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        const setRow = new Adw.ActionRow({
            title: 'Use the picture above on the GDM login screen',
            subtitle: 'Copies the image and updates system login settings.',
        });
        setRow.add_suffix(setButton);
        setRow.activatable_widget = setButton;
        this._gdmGroup.add(setRow);

        setButton.connect('clicked', () => {
            const imagePath = this._settings.get_string('picture-uri');
            if (!imagePath || imagePath === '/path/to/picture') {
                this._showToast('Choose a picture above first');
                return;
            }
            if (!GLib.file_test(imagePath, GLib.FileTest.EXISTS)) {
                this._showToast('Picture file not found');
                return;
            }
            // Always refresh helper from the extension package, then apply.
            // Covers multi-monitor composite updates without a separate install step.
            this._runPkexec(
                ['install', '-m', '755', this._helperSource, HELPER_PATH],
                {
                    requireSuccessToken: false,
                    onSuccess: () => {
                        this._runPkexec([HELPER_PATH, 'set', imagePath], {
                            onSuccess: () => {
                                statusRow.subtitle =
                                    'Custom login background is active (same image on each monitor). Log out or reboot to verify.';
                                this._showToast('GDM login background updated');
                            },
                        });
                    },
                    onFailure: message => {
                        this._showToast(message || 'Could not update helper');
                    },
                });
        });

        const resetButton = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        const resetRow = new Adw.ActionRow({
            title: 'Restore default GDM background',
        });
        resetRow.add_suffix(resetButton);
        resetRow.activatable_widget = resetButton;
        this._gdmGroup.add(resetRow);

        resetButton.connect('clicked', () => {
            this._runPkexec([HELPER_PATH, 'reset'], {
                onSuccess: () => {
                    statusRow.subtitle = 'Helper installed. Login background not set yet.';
                    this._showToast('GDM login background reset');
                },
            });
        });
    }

    _installCommand() {
        // Prefer the helper shipped inside the installed extension dir.
        const src = this._helperSource.replace(/'/g, `'\\''`);
        return `sudo install -m 755 '${src}' '${HELPER_PATH}'`;
    }

    _installHelper() {
        if (!GLib.file_test(this._helperSource, GLib.FileTest.EXISTS)) {
            this._showToast('Helper script missing from extension files');
            return;
        }

        // pkexec shows the graphical admin password dialog.
        this._runPkexec(['install', '-m', '755', this._helperSource, HELPER_PATH], {
            requireSuccessToken: false,
            onSuccess: () => {
                this._showToast('GDM helper installed');
                this._rebuildGdmGroup();
            },
            onFailure: message => {
                this._showToast(message || 'Install failed');
            },
        });
    }

    _getGdmStatus() {
        try {
            const proc = Gio.Subprocess.new(
                [HELPER_PATH, 'status'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            const [, stdout] = proc.communicate_utf8(null, null);
            if (proc.get_exit_status() === 0 && stdout)
                return stdout.trim();
        } catch (e) {
            logError(e, 'getGdmStatus');
        }
        return 'NOT_SET';
    }

    _runPkexec(argv, {onSuccess = null, onFailure = null, requireSuccessToken = true} = {}) {
        let proc;
        try {
            proc = Gio.Subprocess.new(
                ['pkexec', ...argv],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        } catch (e) {
            logError(e, 'pkexec start');
            onFailure?.(`Failed to start pkexec: ${e.message}`);
            return;
        }

        proc.communicate_utf8_async(null, null, (proc, result) => {
            let stdout = '';
            let stderr = '';
            try {
                [, stdout, stderr] = proc.communicate_utf8_finish(result);
            } catch (e) {
                logError(e, 'pkexec communicate');
                onFailure?.(`Failed to run helper: ${e.message}`);
                return;
            }

            const exitStatus = proc.get_exit_status();
            // 126/127: cancelled or not found. 1 often means auth dismissed.
            if (exitStatus === 126 || exitStatus === 127)
                return;

            const out = `${stdout || ''}\n${stderr || ''}`;
            const ok = exitStatus === 0 &&
                (!requireSuccessToken || out.includes('SUCCESS'));

            if (ok) {
                onSuccess?.();
                return;
            }

            // Quiet cancel/auth-fail when no useful message.
            if (exitStatus === 1 && !stderr?.trim() && !stdout?.trim())
                return;

            const errMsg = stderr?.trim() || stdout?.trim() || `exit ${exitStatus}`;
            onFailure?.(errMsg);
        });
    }

    _copyToClipboard(text) {
        const display = Gdk.Display.get_default();
        if (!display)
            return;
        const clipboard = display.get_clipboard();
        clipboard.set(text);
    }

    _showToast(message) {
        if (this._window && typeof this._window.add_toast === 'function') {
            this._window.add_toast(new Adw.Toast({title: message, timeout: 3}));
            return;
        }

        const dlg = new Adw.AlertDialog({
            heading: message,
        });
        dlg.add_response('ok', 'OK');
        dlg.present(this._window);
    }

    _choosePicture(window, pictureRow) {
        const dialog = new Gtk.FileDialog({title: 'Select File'});
        const filter = new Gtk.FileFilter();
        filter.add_pixbuf_formats();
        dialog.default_filter = filter;

        dialog.open(window, null, (dialog, result) => {
            try {
                const file = dialog.open_finish(result);
                const path = file?.get_path();
                if (path)
                    pictureRow.set_text(path);
            } catch (e) {
                if (!e.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(e);
            }
        });
    }
}
