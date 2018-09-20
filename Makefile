
schemas:
	glib-compile-schemas unlockDialogBackground@sun.wxg@gmail.com/schemas/

submit: schemas
	cd unlockDialogBackground@sun.wxg@gmail.com/ && zip -r ~/unlockDialogBackground.zip *

install:
	rm -rf ~/.local/share/gnome-shell/extensions/unlockDialogBackground@sun.wxg@gmail.com
	cp -r unlockDialogBackground@sun.wxg@gmail.com ~/.local/share/gnome-shell/extensions/

