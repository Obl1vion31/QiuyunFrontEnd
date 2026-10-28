-- 同一登录标识不能属于不同用户；迁移失败不自动重命名历史身份。
SELECT pg_advisory_xact_lock(719301);
--> statement-breakpoint
LOCK TABLE auth_user IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM auth_user WHERE btrim(name)='' OR btrim(username)='') OR EXISTS (
  SELECT identifier FROM (
   SELECT id,lower(btrim(name)) AS identifier FROM auth_user
   UNION ALL SELECT id,lower(btrim(username)) FROM auth_user
  ) names GROUP BY identifier HAVING count(DISTINCT id)>1
 ) THEN RAISE EXCEPTION 'Existing account identifiers conflict; resolve explicitly before migration'; END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_name_key" ON "auth_user" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_login_identifier_username_key" ON "auth_user" USING btree (lower(btrim("username")));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_account_login_identifiers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(719301);
 IF btrim(NEW.name)='' OR btrim(NEW.username)='' THEN
  RAISE EXCEPTION 'Account identifiers cannot be empty' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM auth_user other WHERE other.id<>NEW.id AND (
  lower(btrim(other.name)) IN (lower(btrim(NEW.name)),lower(btrim(NEW.username))) OR
  lower(btrim(other.username)) IN (lower(btrim(NEW.name)),lower(btrim(NEW.username)))
 )) THEN
  RAISE EXCEPTION 'Account identifier already in use' USING ERRCODE='23505',CONSTRAINT='auth_user_login_identifier';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER auth_user_login_identifier_guard BEFORE INSERT OR UPDATE OF name,username ON auth_user
 FOR EACH ROW EXECUTE FUNCTION enforce_account_login_identifiers();
