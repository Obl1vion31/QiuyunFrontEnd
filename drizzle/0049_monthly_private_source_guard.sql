-- 保留来源结构，阻止仍运行的旧部署以原三层格式覆盖已经升级的月份。
CREATE OR REPLACE FUNCTION qiuyun_guard_monthly_private_sources() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.data->>'schemaVersion' = '2' AND NEW.data->>'schemaVersion' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'Private source format cannot be downgraded; refresh the application.'
      USING ERRCODE = '23514', CONSTRAINT = 'operations_monthly_private_sources_no_downgrade';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER operations_monthly_private_sources_no_downgrade
BEFORE UPDATE OF data ON operations_monthly_private
FOR EACH ROW EXECUTE FUNCTION qiuyun_guard_monthly_private_sources();
