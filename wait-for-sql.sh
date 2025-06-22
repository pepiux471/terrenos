#!/bin/sh

# Espera a que SQL Server esté listo
echo "⏳ Esperando a que SQL Server esté disponible en $DB_HOST:$DB_PORT..."

while ! nc -z $DB_HOST $DB_PORT; do
  sleep 1
done

echo "✅ SQL Server está disponible — ejecutando aplicación..."
exec "$@"
