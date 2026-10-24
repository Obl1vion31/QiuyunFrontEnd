ALTER TABLE "operations_annual_plan"
  ALTER COLUMN "current_version_number" SET DEFAULT 0;

ALTER TABLE "operations_annual_plan"
  DROP CONSTRAINT "operations_annual_plan_version_check";

ALTER TABLE "operations_annual_plan_version"
  DROP CONSTRAINT "operations_annual_plan_version_number_check";

DELETE FROM "operations_annual_plan_version" AS version
USING "operations_annual_plan" AS plan
WHERE version."plan_id" = plan."id"
  AND version."version_number" <> plan."current_version_number";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "operations_annual_plan" AS plan
    LEFT JOIN "operations_annual_plan_version" AS version
      ON version."plan_id" = plan."id"
      AND version."version_number" = plan."current_version_number"
    WHERE version."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot initialize THE PLAN V0: a current version snapshot is missing';
  END IF;
END $$;

UPDATE "operations_annual_plan_version" AS version
SET
  "version_number" = 0,
  "change_summary" = '初始化基线',
  "diff_summary" = '["保留当前内容并归档为 V0"]'::jsonb
FROM "operations_annual_plan" AS plan
WHERE version."plan_id" = plan."id"
  AND version."version_number" = plan."current_version_number";

UPDATE "operations_annual_plan"
SET "current_version_number" = 0;

ALTER TABLE "operations_annual_plan"
  ADD CONSTRAINT "operations_annual_plan_version_check"
  CHECK ("current_version_number" >= 0);

ALTER TABLE "operations_annual_plan_version"
  ADD CONSTRAINT "operations_annual_plan_version_number_check"
  CHECK ("version_number" >= 0);
