FROM nginx:alpine
COPY albany-prospect-list.html /usr/share/nginx/html/index.html
EXPOSE 8099
