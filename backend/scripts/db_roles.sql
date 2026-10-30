-- Two PostgreSQL roles with different powers (security review SEC-11).
--
--   brajsewa_owner  owns the schema; used ONLY by the migration step (DDL). Never by the web process.
--   brajsewa_app    used by gunicorn and the scheduled jobs; read/write DATA only, no DDL, not a superuser.
--
-- Why: the official Postgres image makes POSTGRES_USER a superuser. If the app connects as that user, one SQL
-- injection bug or one compromised container is total control of the database server. With these roles the same
-- compromise can read and change shop data but cannot drop tables, create roles, or read other databases.
--
-- Run ONCE per environment as an administrator, supplying passwords at the command line (never commit them):
--   psql "$ADMIN_DATABASE_URL" -v owner_pw="'$(openssl rand -base64 32)'" -v app_pw="'$(openssl rand -base64 32)'" \
--        -f backend/scripts/db_roles.sql
-- then set MIGRATE_POSTGRES_USER/PASSWORD (owner) and POSTGRES_USER/PASSWORD (app) for the services.
\set ON_ERROR_STOP on

CREATE ROLE brajsewa_owner LOGIN PASSWORD :owner_pw NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE brajsewa_app   LOGIN PASSWORD :app_pw   NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT CONNECT ON DATABASE brajsewa TO brajsewa_owner, brajsewa_app;
ALTER SCHEMA public OWNER TO brajsewa_owner;
GRANT USAGE ON SCHEMA public TO brajsewa_app;

-- Tables and sequences the OWNER creates in future migrations are usable by the app automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE brajsewa_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO brajsewa_app;
ALTER DEFAULT PRIVILEGES FOR ROLE brajsewa_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO brajsewa_app;

-- Existing deployment only: tables already created by another role. Hand them to the owner, then open them to the app.
-- (Skip these three lines on a brand-new database.)
-- REASSIGN OWNED BY brajsewa TO brajsewa_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO brajsewa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO brajsewa_app;

-- Nothing else is granted: no CREATE on the schema, no TRUNCATE, no REFERENCES, no role or database privileges.
