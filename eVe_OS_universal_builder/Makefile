# Makefile — raccourcis build AtomeOS Universal Builder
#
# Usage:
#   make amd64          # image desktop amd64
#   make arm64          # image desktop arm64
#   make minimal ARCH=amd64
#   make dev ARCH=amd64
#   make audio ARCH=amd64
#   make all-amd64      # minimal + desktop + dev + audio amd64
#   make clean          # nettoie /var/tmp/atome_builder
#   make distclean      # + supprime output/

ARCH ?= amd64
BUILDER = ./core/build.sh

.PHONY: help amd64 arm64 minimal desktop dev audio all-amd64 all-arm64 clean distclean

help:
	@echo "Cibles disponibles :"
	@echo "  make amd64              → desktop amd64 (par défaut)"
	@echo "  make arm64              → desktop arm64"
	@echo "  make minimal ARCH=…     → profil minimal"
	@echo "  make desktop ARCH=…     → profil desktop"
	@echo "  make dev ARCH=…         → profil dev (toolchains complètes)"
	@echo "  make audio ARCH=…       → profil audio basse latence"
	@echo "  make all-amd64          → tous les profils amd64"
	@echo "  make all-arm64          → tous les profils arm64"
	@echo "  make clean / distclean"

amd64:
	sudo $(BUILDER) --arch amd64 --profile desktop

arm64:
	sudo $(BUILDER) --arch arm64 --profile desktop

minimal:
	sudo $(BUILDER) --arch $(ARCH) --profile minimal

desktop:
	sudo $(BUILDER) --arch $(ARCH) --profile desktop

dev:
	sudo $(BUILDER) --arch $(ARCH) --profile dev

audio:
	sudo $(BUILDER) --arch $(ARCH) --profile audio

all-amd64:
	sudo $(BUILDER) --arch amd64 --profile minimal
	sudo $(BUILDER) --arch amd64 --profile desktop
	sudo $(BUILDER) --arch amd64 --profile dev
	sudo $(BUILDER) --arch amd64 --profile audio

all-arm64:
	sudo $(BUILDER) --arch arm64 --profile minimal
	sudo $(BUILDER) --arch arm64 --profile desktop

clean:
	sudo rm -rf /var/tmp/atome_builder

distclean: clean
	rm -rf output/
