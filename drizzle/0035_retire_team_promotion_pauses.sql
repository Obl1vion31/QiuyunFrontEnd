-- 功能退役时结束有效批次，保留此前区间、关联活动及审计，不删除业务事实。
UPDATE operations_promotion_pause
SET resumed_at = GREATEST(starts_at, CURRENT_TIMESTAMP),
    revision = revision + 1,
    updated_at = CURRENT_TIMESTAMP,
    history = history || jsonb_build_array(jsonb_build_object(
      'at', CURRENT_TIMESTAMP, 'actor', 'system', 'action', 'feature_retired', 'endsAt', ends_at
    ))
WHERE ends_at > CURRENT_TIMESTAMP
  AND (resumed_at IS NULL OR resumed_at > GREATEST(starts_at, CURRENT_TIMESTAMP));
