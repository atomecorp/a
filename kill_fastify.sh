#!/bin/bash
set -e

FASTIFY_PORT=3001

# Récupère les PID écoutant sur $FASTIFY_PORT
PIDS=$(lsof -tiTCP:"$FASTIFY_PORT" -sTCP:LISTEN)

if [ -n "$PIDS" ]; then
  echo "Arrêt du serveur sur le port $FASTIFY_PORT…"
  # Envoie SIGTERM à chaque PID (remplace par -9 si besoin)
  kill $PIDS
else
  echo "Aucun process n'écoute sur le port $FASTIFY_PORT."
fi