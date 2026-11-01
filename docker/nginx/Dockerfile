FROM nginxinc/nginx-unprivileged:1.28-alpine

USER root
COPY start.sh /etc/linkflow/start.sh
COPY templates/ /etc/linkflow/templates/
COPY snippets/ /etc/linkflow/snippets/
RUN chmod 0555 /etc/linkflow/start.sh \
    && chmod 0444 /etc/linkflow/templates/* /etc/linkflow/snippets/*

ENV PROXY_MODE=local PUBLIC_BASE_URL=http://localhost:8080
USER 101:101
EXPOSE 8080 8443
ENTRYPOINT ["sh", "/etc/linkflow/start.sh"]
