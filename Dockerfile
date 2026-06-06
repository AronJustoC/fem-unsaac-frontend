# Dockerfile para EasyPanel / contenedores
# Puerto interno atipico por defecto: 18082
FROM node:22-alpine AS build

WORKDIR /app

# Variables publicas de Astro se inyectan en build time.
# En EasyPanel configura estos valores como Build Args si necesitas cambiar URLs.
ARG PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ARG PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
ARG PUBLIC_API_URL=http://localhost:18081

ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL \
    PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY \
    PUBLIC_API_URL=$PUBLIC_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV PORT=18082

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 18082

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
