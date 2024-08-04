FROM node:latest

WORKDIR /usr/src/app

# Copy the rest of the source files into the image.
COPY . .

# Ensure the script is executable and convert line endings
RUN chmod +x /usr/src/app/src/create_docker_image.sh && sed -i 's/\r$//' /usr/src/app/src/create_docker_image.sh && cat -v /usr/src/app/src/create_docker_image.sh

# Install npm packages
RUN npm install

# Expose the port that the application listens on.
EXPOSE 5000

# Run the application.
CMD npm start
