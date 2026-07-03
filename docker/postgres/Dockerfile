FROM postgres:16-bookworm

ENV POSTGRES_USER=auditapp \
    POSTGRES_PASSWORD=changeme \
    POSTGRES_DB=auditapp

COPY docker-entrypoint.sh /usr/local/bin/auditapp-postgres-entrypoint.sh
RUN chmod +x /usr/local/bin/auditapp-postgres-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/auditapp-postgres-entrypoint.sh"]
