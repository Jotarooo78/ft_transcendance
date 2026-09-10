NAME = Transcendance

setup:
	@docker compose -f docker-compose.yml up -d --build

down:
	@docker compose -f docker-compose.yml down

logs:
	@docker compose -f docker-compose.yml logs -f --tail=120

prune:
	@docker system prune -af

.PHONY: setup down logs prune