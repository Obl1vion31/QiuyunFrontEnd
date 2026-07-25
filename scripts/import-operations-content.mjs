import 'dotenv/config';
import ExcelJS from 'exceljs';
import postgres from 'postgres';

const filePath = new URL('../public/excel/20260725 运营内容导入.xlsx', import.meta.url);
const sourceName = '20260725-operations-content';
const apply = process.argv.includes('--apply');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);
const worksheet = workbook.worksheets[0];

const text = (cell) => {
  const value = cell.value;
  if (value && typeof value === 'object' && 'text' in value) return String(value.text).trim();
  return value == null ? '' : String(value).trim();
};

const hyperlink = (cell) => {
  const value = cell.value;
  if (value && typeof value === 'object' && 'hyperlink' in value) return String(value.hyperlink).trim();
  return cell.hyperlink?.trim() || null;
};

const parseShanghaiDate = (value) => {
  if (!value) return null;
  const match = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!match) throw new Error(`无法识别时间：${value}`);
  const [, year, month, day, hour = '0', minute = '0'] = match;
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+08:00`);
};

const promotionStatus = (promoted, stage, contentName) => {
  if (promoted !== '推广帖') return 'none';
  if (stage.includes('放量淘汰') || stage.includes('跑量淘汰')) return 'formal_discarded';
  if (stage.includes('淘汰') || stage.includes('报废') || stage.includes('测试结束')) return 'test_discarded';
  if (stage.includes('测试')) return 'testing';
  if (stage.includes('放量')) return 'scaling';
  if (stage.includes('下架')) return contentName.includes('讲义帖') ? 'ended' : 'test_discarded';
  if (stage.includes('结束')) return 'ended';
  if (stage === '待发') return 'pending';
  return 'none';
};

const completionStatus = (plannedPublishAt, actualPublishAt) => {
  if (!actualPublishAt) return 'pending';
  if (actualPublishAt.getTime() - plannedPublishAt.getTime() > 12 * 60 * 60 * 1000) return 'delayed';
  return 'on_time';
};

const countBy = (values) => values.reduce((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

const sameCounts = (actual, expected) => (
  Object.keys(actual).length === Object.keys(expected).length
  && Object.entries(expected).every(([key, value]) => actual[key] === value)
);

const expectedPromotionCounts = { none: 44, ended: 3, test_discarded: 6 };
const expectedCompletionCounts = { on_time: 41, delayed: 12 };

const legacyCompletionStatus = (value) => {
  if (value.includes('延期')) return 'delayed';
  if (value === '按时完成') return 'on_time';
  return 'pending';
};

const rows = [];
const excludedRows = [];
for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
  const row = worksheet.getRow(rowNumber);
  const contentName = text(row.getCell('C'));
  if (!contentName) continue;
  const plannedPublishAt = parseShanghaiDate(text(row.getCell('H')));
  if (!plannedPublishAt) throw new Error(`第 ${rowNumber} 行缺少应发时间`);
  const shanghaiMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(plannedPublishAt);
  if (!['2026-04', '2026-05', '2026-06'].includes(shanghaiMonth)) {
    excludedRows.push({ rowNumber, shanghaiMonth });
    continue;
  }
  const actualPublishAt = parseShanghaiDate(text(row.getCell('I')));
  const derivedCompletionStatus = completionStatus(plannedPublishAt, actualPublishAt);
  const importedCompletionStatus = legacyCompletionStatus(text(row.getCell('J')));
  rows.push({
    sourceKey: `${sourceName}:${rowNumber}`,
    contentName,
    contentType: '未分类（历史导入）',
    syncToMoments: ['是', '✅'].includes(text(row.getCell('E'))),
    promotionStatus: promotionStatus(text(row.getCell('D')), text(row.getCell('F')), contentName),
    projectDocName: text(row.getCell('G')) || null,
    projectDocUrl: hyperlink(row.getCell('G')),
    plannedPublishAt,
    actualPublishAt,
    completionStatus: derivedCompletionStatus,
    delayReason: text(row.getCell('K')) || null,
    completionStatusCorrected: derivedCompletionStatus !== importedCompletionStatus,
  });
}

const linked = rows.filter((row) => row.projectDocUrl).length;
const promotionCounts = countBy(rows.map((row) => row.promotionStatus));
const completionCounts = countBy(rows.map((row) => row.completionStatus));
if (
  rows.length !== 53
  || linked !== 53
  || excludedRows.length !== 1
  || excludedRows[0].shanghaiMonth !== '2026-07'
  || !sameCounts(promotionCounts, expectedPromotionCounts)
  || !sameCounts(completionCounts, expectedCompletionCounts)
) {
  throw new Error(`导入校验失败：读取 ${rows.length} 条、${linked} 个链接，排除 ${JSON.stringify(excludedRows)}；推广状态 ${JSON.stringify(promotionCounts)}；完成状态 ${JSON.stringify(completionCounts)}`);
}

if (!apply) {
  console.log(`校验通过：4–6 月 ${rows.length} 条记录，${linked} 个项目文档链接；排除 Excel 中 ${excludedRows.length} 条 7 月记录。`);
  console.log(`推广状态：非推广 ${promotionCounts.none}、推广周期已结束 ${promotionCounts.ended}、测试淘汰 ${promotionCounts.test_discarded}。`);
  console.log(`完成状态：按时发布 ${completionCounts.on_time}、延期发布 ${completionCounts.delayed}；${rows.filter((row) => row.completionStatusCorrected).length} 条按时间纠正。`);
  console.log('这是只读预检；确认开发数据库后，使用 pnpm db:import -- --apply 在同一事务中删除 7 月数据并导入 4–6 月数据。');
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error('缺少 DATABASE_URL');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  let inserted = 0;
  let deletedSchedules = 0;
  let deletedVersions = 0;
  let deletedContents = 0;
  await sql.begin(async (transaction) => {
    const julyVersions = await transaction`
      SELECT DISTINCT version.id, version.content_id
      FROM operations_content_version AS version
      INNER JOIN operations_content_schedule AS schedule
        ON schedule.content_version_id = version.id
      WHERE schedule.planned_publish_at >= TIMESTAMPTZ '2026-07-01 00:00:00+08'
        AND schedule.planned_publish_at < TIMESTAMPTZ '2026-08-01 00:00:00+08'
    `;
    const julyVersionIds = julyVersions.map((row) => row.id);
    const julyContentIds = [...new Set(julyVersions.map((row) => row.content_id))];

    if (julyVersionIds.length) {
      const referenced = await transaction`
        SELECT version.id
        FROM operations_content_version AS version
        WHERE version.source_version_id IN ${transaction(julyVersionIds)}
        LIMIT 1
      `;
      if (referenced.length) {
        throw new Error('7 月内容存在子版本引用，已取消删除和导入。');
      }

      const schedules = await transaction`
        DELETE FROM operations_content_schedule
        WHERE planned_publish_at >= TIMESTAMPTZ '2026-07-01 00:00:00+08'
          AND planned_publish_at < TIMESTAMPTZ '2026-08-01 00:00:00+08'
        RETURNING id
      `;
      deletedSchedules = schedules.length;

      const versions = await transaction`
        DELETE FROM operations_content_version
        WHERE id IN ${transaction(julyVersionIds)}
          AND NOT EXISTS (
            SELECT 1
            FROM operations_content_schedule
            WHERE content_version_id = operations_content_version.id
          )
        RETURNING id
      `;
      deletedVersions = versions.length;

      const contents = await transaction`
        DELETE FROM operations_content
        WHERE id IN ${transaction(julyContentIds)}
          AND NOT EXISTS (
            SELECT 1
            FROM operations_content_version
            WHERE content_id = operations_content.id
          )
        RETURNING id
      `;
      deletedContents = contents.length;
    }

    for (const row of rows) {
      const existing = await transaction`
        SELECT id FROM operations_content_schedule WHERE source_key = ${row.sourceKey} LIMIT 1
      `;
      if (existing.length) continue;
      const [content] = await transaction`
        INSERT INTO operations_content DEFAULT VALUES RETURNING id
      `;
      const [version] = await transaction`
        INSERT INTO operations_content_version
          (content_id, version_number, work_type, content_name, content_type,
           project_doc_name, project_doc_url)
        VALUES
          (${content.id}, 0, 'new', ${row.contentName}, ${row.contentType},
           ${row.projectDocName}, ${row.projectDocUrl})
        RETURNING id
      `;
      const result = await transaction`
        INSERT INTO operations_content_schedule
          (content_version_id, sync_to_moments, promotion_status, planned_publish_at,
           actual_publish_at, completion_status, delay_reason, source_key)
        VALUES
          (${version.id}, ${row.syncToMoments}, ${row.promotionStatus}, ${row.plannedPublishAt},
           ${row.actualPublishAt}, ${row.completionStatus}, ${row.delayReason}, ${row.sourceKey})
        RETURNING id
      `;
      inserted += result.length;
    }
  });
  console.log(`7 月清理完成：删除 ${deletedSchedules} 条排期、${deletedVersions} 个版本、${deletedContents} 个帖子。`);
  console.log(`4–6 月导入完成：新增 ${inserted} 条，跳过 ${rows.length - inserted} 条已导入记录。`);
} finally {
  await sql.end();
}
