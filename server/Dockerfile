FROM ghcr.io/edgelesssys/privatemode/privatemode-proxy:latest AS proxy

FROM node:20-slim
WORKDIR /app

# node:20-slim ships without CA certs, so the proxy's outbound TLS calls to
# Privatemode's mesh CA/manifest server fail verification without this.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pull the Privatemode encryption proxy binary out of its official image.
COPY --from=proxy /bin/privatemode-proxy /bin/privatemode-proxy

COPY package.json ./
RUN npm install --omit=dev

COPY index.js logic.js ./

EXPOSE 3000
CMD ["node", "index.js"]
