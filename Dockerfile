FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist/frontendangular/browser /usr/share/nginx/html
COPY nginx/default-http.conf.template  /etc/nginx/templates/default-http.conf.template
COPY nginx/default-https.conf.template /etc/nginx/templates/default-https.conf.template
COPY nginx/start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh

EXPOSE 80 443

CMD ["/start-nginx.sh"]
