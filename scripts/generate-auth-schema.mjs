
import {DatabaseSync} from 'node:sqlite';
import {getMigrations} from 'better-auth/db/migration';
import {writeFileSync} from 'node:fs';
import {createAuth} from '../worker/auth/config.mjs';
const database=new DatabaseSync(':memory:');
const auth=createAuth({AUTH_DB:database,AUTH_ORIGIN:'https://schema.invalid',AUTH_SECRET:'schema-generation-only-never-a-runtime-secret',AUTH_FROM:'signup@schema.invalid'});
const migrations=await getMigrations(auth.options);
let sql=await migrations.compileMigrations();
sql+='\nCREATE INDEX user_signup_ip ON user(signupIpHash);\n';
sql+="CREATE TRIGGER limit_signup_ip BEFORE INSERT ON user WHEN (SELECT COUNT(*) FROM user WHERE signupIpHash=NEW.signupIpHash)>=4 BEGIN SELECT RAISE(ABORT, 'Signup unavailable'); END;\n";
sql+='CREATE UNIQUE INDEX user_email_normalized ON user(lower(email));\n';
writeFileSync(new URL('../migrations/0001_accounts.sql',import.meta.url),sql);
database.close();console.log('Generated auth database schema with transactional signup constraints.');
