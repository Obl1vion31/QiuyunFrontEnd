DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "operations_promotion_stage"
    WHERE "ended_on" IS NULL
    GROUP BY "campaign_id"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'promotion campaign has more than one open stage';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "operations_promotion_stage" left_stage
    JOIN "operations_promotion_stage" right_stage
      ON right_stage."campaign_id" = left_stage."campaign_id"
     AND right_stage."id" <> left_stage."id"
     AND daterange(
       left_stage."started_on",
       COALESCE(left_stage."ended_on", 'infinity'::date),
       '[]'
     ) && daterange(
       right_stage."started_on",
       COALESCE(right_stage."ended_on", 'infinity'::date),
       '[]'
     )
  ) THEN
    RAISE EXCEPTION 'promotion campaign has overlapping stages';
  END IF;
END
$$;
--> statement-breakpoint

CREATE UNIQUE INDEX "operations_promotion_stage_one_open_idx"
ON "operations_promotion_stage" USING btree ("campaign_id")
WHERE "ended_on" IS NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "operations_guard_promotion_stage_overlap"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "operations_promotion_stage" existing
    WHERE existing."campaign_id" = NEW."campaign_id"
      AND existing."id" <> NEW."id"
      AND daterange(
        existing."started_on",
        COALESCE(existing."ended_on", 'infinity'::date),
        '[]'
      ) && daterange(
        NEW."started_on",
        COALESCE(NEW."ended_on", 'infinity'::date),
        '[]'
      )
  ) THEN
    RAISE EXCEPTION 'promotion stages cannot overlap within one campaign'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER "operations_promotion_stage_overlap_trigger"
BEFORE INSERT OR UPDATE OF "campaign_id", "started_on", "ended_on"
ON "operations_promotion_stage"
FOR EACH ROW
EXECUTE FUNCTION "operations_guard_promotion_stage_overlap"();
