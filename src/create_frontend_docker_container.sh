#!/bin/bash

# Validate input parameters
if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <environment> <base_directory> <image_name> <dns_name>"
    exit 1
fi

# Assign input parameters to variables
ENVIRONMENT="$1"
BASE_DIR="$2"
IMAGE_NAME=$(echo "$3" | tr '[:upper:]' '[:lower:]') # Convert image name to lowercase
DNS_NAME="$4"

# Ensure the base directory path is correctly handled
BASE_DIR=$(realpath "$BASE_DIR")
if [ $? -ne 0 ]; then
    echo "Error: Failed to resolve base directory path."
    exit 1
fi

# Function to find an available port
find_available_port() {
    local port
    while true; do
        port=$((RANDOM % 64512 + 1024)) # Avoid ports below 1024 (Reserved ports)
        (echo > /dev/tcp/localhost/$port) >/dev/null 2>&1
        if [ $? -ne 0 ]; then
            echo $port
            return 0
        fi
    done
}

# Get available ports
HOST_PORT=$(find_available_port)
CONTAINER_PORT=$HOST_PORT
echo "Selected ports - Host: $HOST_PORT, Container: $CONTAINER_PORT"

# Function to generate Dockerfile for React.js
generate_react_dockerfile() {
    cat <<EOF > "$BASE_DIR/Dockerfile"
# Use an official Node.js runtime as a parent image
FROM node:latest

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock) to the working directory
COPY package*.json yarn.lock* ./

# Install dependencies
RUN if [ -f yarn.lock ]; then yarn install --frozen-lockfile; else npm install; fi

# Copy the rest of the application code to the working directory
COPY . .

# Build the app for production to the build folder
RUN npm run build

# Use Nginx to serve the static files
FROM nginx:alpine

# Copy static assets from builder stage
COPY --from=0 /usr/src/app/build /usr/share/nginx/html

# Expose the port Nginx is running on
EXPOSE 80

# Start Nginx and keep it running in the foreground
CMD ["nginx", "-g", "daemon off;"]
EOF
}

# Function to generate .dockerignore file for React.js
generate_node_dockerignore() {
    cat <<EOF > "$BASE_DIR/.dockerignore"
**/.classpath
**/.dockerignore
**/.env
**/.git
**/.gitignore
**/.project
**/.settings
**/.toolstarget
**/.vs
**/.vscode
**/.next
**/.cache
**/*.*proj.user
**/*.dbmdl
**/*.jfm
**/charts
**/docker-compose*
**/compose.y*ml
**/Dockerfile*
**/node_modules
**/npm-debug.log
**/obj
**/secrets.dev.yaml
**/values.dev.yaml
**/build
**/dist
LICENSE
README.md
EOF
}

# Check if the base directory exists
if [ ! -d "$BASE_DIR" ]; then
    echo "Error: Base directory $BASE_DIR does not exist."
    exit 1
fi

# Generate Dockerfile and .dockerignore file based on environment
if [ "$ENVIRONMENT" == "node" ]; then
    generate_node_dockerfile
    generate_node_dockerignore
# elif [ "$ENVIRONMENT" == "python" ]; then
#     generate_python_dockerfile
#     generate_python_dockerignore
else
    echo "Unsupported environment: $ENVIRONMENT"
    exit 1
fi

# Navigate to the base directory and build the Docker image
cd "$BASE_DIR" || { echo "Failed to navigate to base directory: $BASE_DIR"; exit 1; }

# Print the current directory for debugging
echo "Current directory: $(pwd)"

# List files in the current directory for debugging
echo "Files in the directory:"
ls -al

# Determine the latest version of the image (if any) and increment it
LATEST_VERSION=$(docker images --format "{{.Tag}}" "$IMAGE_NAME" | sort -r | head -n 1)
NEW_VERSION=$((LATEST_VERSION + 1))

# If no previous versions exist, start from version 1
if [ -z "$LATEST_VERSION" ]; then
    NEW_VERSION=1
fi

# Build the Docker image with the new version tag
docker build --progress=plain -t "${IMAGE_NAME}:${NEW_VERSION}" .
if [ $? -ne 0 ]; then
    echo "Error: Failed to build Docker image."
    exit 1
fi

# Check if the container with the given name exists
if docker ps -a --format '{{.Names}}' | grep -Eq "^${IMAGE_NAME}-container$"; then
    echo "Warning: Container with the name $IMAGE_NAME-container already exists."

    # Stop the container if it is running
    if [ "$(docker inspect -f '{{.State.Running}}' "$IMAGE_NAME-container")" == "true" ]; then
        echo "Stopping the container $IMAGE_NAME-container."
        docker stop "$IMAGE_NAME-container"
    fi

    # Remove the container after stopping it
    echo "Removing the container $IMAGE_NAME-container."
    docker rm "$IMAGE_NAME-container"
else
    echo "No existing container with the name $IMAGE_NAME-container found."
fi

docker run -d \
  --network web \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.${IMAGE_NAME}-app.rule=Host(\`${DNS_NAME}\`) && PathPrefix(\`/${IMAGE_NAME}\`)" \
  --label "traefik.http.services.${IMAGE_NAME}-app.loadbalancer.server.port=${CONTAINER_PORT}" \
  --label "traefik.http.routers.${IMAGE_NAME}-app.middlewares=${IMAGE_NAME}-stripprefix@docker" \
  --label "traefik.http.middlewares.${IMAGE_NAME}-stripprefix.stripprefix.prefixes=/${IMAGE_NAME}" \
  --name "${IMAGE_NAME}-container" \
  "${IMAGE_NAME}:${NEW_VERSION}"

if [ $? -ne 0 ]; then
    echo "Error: Failed to run Docker container."
    exit 1
fi

echo "Docker image ${IMAGE_NAME}:${NEW_VERSION} created and container ${IMAGE_NAME}-container running successfully on port $HOST_PORT with DNS ${DNS_NAME}."
