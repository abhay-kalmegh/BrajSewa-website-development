"""Static checks on backend/scripts/db_roles.sql: the app role must stay low-privilege.
Run from the repository root:  python3 -m unittest tests.test_db_roles_sql
"""
import re
import unittest

with open('backend/scripts/db_roles.sql') as handle:
    SQL = handle.read()
# drop comments and psql meta-commands (lines starting with a backslash have no terminating semicolon)
SQL_ONLY = '\n'.join(l for l in re.sub(r'--.*', '', SQL).splitlines() if not l.lstrip().startswith('\\'))
STATEMENTS = [s.strip() for s in SQL_ONLY.split(';') if s.strip()]


def about(role):
    return [s for s in STATEMENTS if re.search(rf'\b{role}\b', s)]


class DbRolesTests(unittest.TestCase):
    def test_both_roles_are_created_without_dangerous_attributes(self):
        for role in ('brajsewa_owner', 'brajsewa_app'):
            create = [s for s in STATEMENTS if s.startswith(f'CREATE ROLE {role}')]
            self.assertEqual(len(create), 1, role)
            for attr in ('NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION'):
                self.assertIn(attr, create[0], f'{role} missing {attr}')

    def test_passwords_come_from_psql_variables_not_the_file(self):
        self.assertIn(':owner_pw', SQL)
        self.assertIn(':app_pw', SQL)
        self.assertNotRegex(SQL, r"PASSWORD\s+'[^']+'")

    def test_app_role_gets_data_privileges_only(self):
        grants = ' '.join(s for s in about('brajsewa_app') if s.startswith(('GRANT', 'ALTER DEFAULT')))
        self.assertNotRegex(grants, r'GRANT\s+ALL', 'app role must not receive ALL privileges')
        for forbidden in ('CREATE ON', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'SUPERUSER', 'WITH GRANT OPTION'):
            self.assertNotIn(forbidden, grants.upper(), forbidden)
        self.assertIn('SELECT, INSERT, UPDATE, DELETE ON ALL TABLES', grants)

    def test_future_tables_are_covered_by_default_privileges(self):
        defaults = [s for s in STATEMENTS if s.startswith('ALTER DEFAULT PRIVILEGES')]
        self.assertTrue(any('ON TABLES' in s for s in defaults))
        self.assertTrue(any('ON SEQUENCES' in s for s in defaults))
        self.assertTrue(all('FOR ROLE brajsewa_owner' in s for s in defaults))

    def test_owner_owns_the_schema(self):
        self.assertTrue(any(s.startswith('ALTER SCHEMA public OWNER TO brajsewa_owner') for s in STATEMENTS))

    def test_the_script_stops_on_the_first_error(self):
        self.assertIn('\\set ON_ERROR_STOP on', SQL)


if __name__ == '__main__':
    unittest.main()
