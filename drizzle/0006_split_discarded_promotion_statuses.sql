-- 将旧的通用淘汰状态统一归入“测试淘汰”。
UPDATE "operations_content_schedule"
SET
  "promotion_status" = 'test_discarded',
  "updated_at" = now()
WHERE "promotion_status" = 'discarded';

-- 20260725 固定导入中，除讲义帖外的“推广已下架”暂统一归入“测试淘汰”。
-- 两条讲义帖和原本“推广已结束”的记录继续保持 ended。
UPDATE "operations_content_schedule"
SET
  "promotion_status" = 'test_discarded',
  "updated_at" = now()
WHERE "source_key" IN (
  '20260725-operations-content:21',
  '20260725-operations-content:23',
  '20260725-operations-content:35',
  '20260725-operations-content:36',
  '20260725-operations-content:39',
  '20260725-operations-content:46'
)
AND "promotion_status" = 'ended';
