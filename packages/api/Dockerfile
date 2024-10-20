# Use the official Deno image
FROM denoland/deno:latest

# Set working directory
WORKDIR /app

# Copy necessary files
COPY deno.json .
COPY import_map.json .
COPY deps.ts .

# Cache dependencies
RUN deno cache -c deno.json deps.ts

# Copy the rest of the application code
COPY . .

# Expose the application port (adjust if different)
EXPOSE 8000

# Run the application
CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-sys", "--unstable", "--unstable-kv", "--config=deno.json", "app.ts"]