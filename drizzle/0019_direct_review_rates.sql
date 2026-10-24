ALTER TABLE "operations_content_performance_metric" ADD COLUMN "click_rate" numeric(7,4);
ALTER TABLE "operations_content_performance_metric" ADD COLUMN "three_second_read_rate" numeric(7,4);

UPDATE "operations_content_performance_metric"
SET "click_rate" = ROUND(("click_numerator"::numeric / "click_denominator") * 100, 4),
    "three_second_read_rate" = ROUND(("three_second_read_numerator"::numeric / "three_second_read_denominator") * 100, 4);

ALTER TABLE "operations_content_performance_metric" ALTER COLUMN "click_rate" SET NOT NULL;
ALTER TABLE "operations_content_performance_metric" ALTER COLUMN "three_second_read_rate" SET NOT NULL;
ALTER TABLE "operations_content_performance_metric" DROP CONSTRAINT "operations_content_metric_click_check";
ALTER TABLE "operations_content_performance_metric" DROP CONSTRAINT "operations_content_metric_read_check";
ALTER TABLE "operations_content_performance_metric" DROP COLUMN "click_numerator";
ALTER TABLE "operations_content_performance_metric" DROP COLUMN "click_denominator";
ALTER TABLE "operations_content_performance_metric" DROP COLUMN "three_second_read_numerator";
ALTER TABLE "operations_content_performance_metric" DROP COLUMN "three_second_read_denominator";
ALTER TABLE "operations_content_performance_metric" DROP COLUMN "source_note";
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_metric_click_check" CHECK ("click_rate" BETWEEN 0 AND 100);
ALTER TABLE "operations_content_performance_metric" ADD CONSTRAINT "operations_content_metric_read_check" CHECK ("three_second_read_rate" BETWEEN 0 AND 100);
