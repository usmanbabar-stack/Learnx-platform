#!/bin/sh

# Entrypoint script for Docker development environment
# Ensures node_modules are installed before starting the app

echo "Checking node_modules..."

# Always ensure dependencies are properly installed
if [ ! -d "node_modules/nodemon" ]; then
  echo "Installing dependencies..."
  npm ci --include=dev
  echo "Dependencies installed successfully."
else
  echo "Dependencies already installed."
fi

# Debug: Check if nodemon exists
if [ -f "node_modules/.bin/nodemon" ]; then
  echo "✓ nodemon found in node_modules/.bin/"
else
  echo "✗ nodemon NOT found in node_modules/.bin/"
fi

# Execute the CMD from Dockerfile
exec "$@"
