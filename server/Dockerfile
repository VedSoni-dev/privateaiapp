FROM ghcr.io/edgelesssys/privatemode/privatemode-proxy:latest AS proxy

FROM node:20-slim
WORKDIR /app

# Pull the Privatemode encryption proxy binary out of its official image.
COPY --from=proxy /bin/privatemode-proxy /bin/privatemode-proxy

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

EXPOSE 3000
CMD ["node", "index.js"]
