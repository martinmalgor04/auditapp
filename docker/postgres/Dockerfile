FROM postgres:16-bookworm

COPY docker/postgres/docker-entrypoint.sh /usr/local/bin/auditapp-postgres-entrypoint.sh
RUN chmod +x /usr/local/bin/auditapp-postgres-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/auditapp-postgres-entrypoint.sh"]
