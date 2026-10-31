UUID := mural@vinicsperes
EXT_DIR := $(or $(XDG_DATA_HOME),$(HOME)/.local/share)/gnome-shell/extensions/$(UUID)

.PHONY: schemas install uninstall pack test e2e

schemas:
	glib-compile-schemas extension/schemas

install: schemas
	mkdir -p "$(dir $(EXT_DIR))"
	ln -sfn "$(CURDIR)/extension" "$(EXT_DIR)"
	@echo "Installed. Log out and back in, then: gnome-extensions enable $(UUID)"

uninstall:
	rm -f "$(EXT_DIR)"

pack: schemas
	mkdir -p build
	gnome-extensions pack extension --force --out-dir=build --extra-source=lib --extra-source=schemas/gschemas.compiled

test:
	node --test tests/*.test.js

e2e:
	tests/e2e/run.sh
