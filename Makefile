NAME = Transcendance

ifeq ($(shell command -v docker 2>/dev/null),)
DOCKER = flatpak-spawn --host docker
else
DOCKER = docker
endif

setup:
	@$(DOCKER) compose -f docker-compose.yml up -d --build

down:
	@$(DOCKER) compose -f docker-compose.yml down

logs:
	@$(DOCKER) compose -f docker-compose.yml logs -f --tail=120

backup:
	@DOCKER="$(DOCKER)" ./scripts/backup.sh

restore:
	@DOCKER="$(DOCKER)" ./scripts/restore.sh $(DIR)

prune:
	@$(DOCKER) system prune -af

.PHONY: setup down logs backup restore prune