# Every shortcut invokes the same public CLI and native orchestrator.
AOS = ../../../scripts/aOS.sh
TARGET ?= pc-amd64-uefi
PROFILE ?= desktop
SOURCE_COMMIT ?=
.PHONY: help list plan preflight build amd64 arm64 audio dev minimal
help:
	@$(AOS) --help
list:
	@$(AOS) list
plan:
	@$(AOS) plan --target $(TARGET) --profile $(PROFILE)
preflight:
	@$(AOS) preflight --target $(TARGET) --profile $(PROFILE)
build:
	$(AOS) build --target $(TARGET) --profile $(PROFILE) --source-commit '$(SOURCE_COMMIT)'
amd64:
	$(MAKE) build TARGET=pc-amd64-uefi
arm64:
	$(MAKE) build TARGET=arm64-uefi
audio dev minimal:
	$(MAKE) build PROFILE=$@
