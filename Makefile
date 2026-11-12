
schemas:
	glib-compile-schemas unlockDialogBackground@sun.wxg@gmail.com/schemas/

submit:
	cd unlockDialogBackground@sun.wxg@gmail.com/ && zip -r ~/unlockDialogBackground.zip *

install: schemas
	rm -rf ~/.local/share/gnome-shell/extensions/unlockDialogBackground@sun.wxg@gmail.com
	cp -r unlockDialogBackground@sun.wxg@gmail.com ~/.local/share/gnome-shell/extensions/
	@echo "Extension installed."
	@echo "Open preferences → GDM Login Screen → Install Helper… (or Set Login Background)."
