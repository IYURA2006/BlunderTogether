# One image: the Go server serves the built web app and the WebSocket endpoint.

FROM node:20-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
COPY core/package.json core/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN npm ci
COPY tsconfig.base.json ./
COPY core core
COPY web web
RUN npm run build --workspace web

FROM golang:1.26 AS server
WORKDIR /src
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server .
# The SQLite driver is pure Go, so the binary needs no C library.
RUN CGO_ENABLED=0 go build -o /server .

FROM gcr.io/distroless/static-debian12
COPY --from=server /server /server
COPY --from=web /src/web/dist /web
# Mount a volume here so the operation log survives a redeploy.
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["/server", "-addr", ":8080", "-db", "/data/blunder.db", "-static", "/web"]
