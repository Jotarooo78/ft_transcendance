NAME = Transcendance

setup:
	@docker-compose -f srcs/docker-compose.yml up -d --build

down:
	@docker-compose -f srcs/docker-compose.yml down

prune:
	@docker system prune -af

.PHONY: up down prune