import 'dotenv/config';
import ExcelJS from 'exceljs';
import postgres from 'postgres';

const filePath = new URL('../public/excel/20260715 运营内容导入.xlsx', import.meta.url);
const sourceName = '20260715-operations-content';
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

const promotionStatus = (promoted, stage) => {
  if (promoted !== '推广帖') return 'none';
  if (stage.includes('淘汰') || stage.includes('报废') || stage.includes('测试结束')) return 'discarded';
  if (stage.includes('测试')) return 'testing';
  if (stage.includes('放量')) return 'scaling';
  if (stage.includes('下架') || stage.includes('暂停')) return 'ended';
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

const sameCounts = (actual, expected) => Object.entries(expected)
  .every(([key, value]) => actual[key] === value);

const expectedPromotionCounts = { none: 57, pending: 5, testing: 1, scaling: 2, ended: 6 };
const expectedCompletionCounts = { pending: 15, on_time: 44, delayed: 12 };

const legacyCompletionStatus = (value) => {
  if (value.includes('延期')) return 'delayed';
  if (value === '按时完成') return 'on_time';
  return 'pending';
};

const rows = [];
for (let rowNumber = 13; rowNumber <= worksheet.rowCount; rowNumber += 1) {
  const row = worksheet.getRow(rowNumber);
  const contentName = text(row.getCell('G'));
  if (!contentName) continue;
  const plannedPublishAt = parseShanghaiDate(text(row.getCell('O')));
  if (!plannedPublishAt) throw new Error(`第 ${rowNumber} 行缺少应发时间`);
  const actualPublishAt = parseShanghaiDate(text(row.getCell('P')));
  const derivedCompletionStatus = completionStatus(plannedPublishAt, actualPublishAt);
  const importedCompletionStatus = legacyCompletionStatus(text(row.getCell('Q')));
  rows.push({
    sourceKey: `${sourceName}:${rowNumber}`,
    contentName,
    contentType: '未分类（历史导入）',
    syncToMoments: text(row.getCell('L')) === '是',
    promotionStatus: promotionStatus(text(row.getCell('J')), text(row.getCell('M'))),
    projectDocName: text(row.getCell('N')) || null,
    projectDocUrl: hyperlink(row.getCell('N')),
    plannedPublishAt,
    actualPublishAt,
    completionStatus: derivedCompletionStatus,
    delayReason: text(row.getCell('R')) || null,
    completionStatusCorrected: derivedCompletionStatus !== importedCompletionStatus,
  });
}

const linked = rows.filter((row) => row.projectDocUrl).length;
const promotionCounts = countBy(rows.map((row) => row.promotionStatus));
const completionCounts = countBy(rows.map((row) => row.completionStatus));
if (rows.length !== 71 || linked !== 56 || !sameCounts(promotionCounts, expectedPromotionCounts) || !sameCounts(completionCounts, expectedCompletionCounts)) {
  throw new Error(`导入校验失败：读取 ${rows.length} 条、${linked} 个链接；推广状态 ${JSON.stringify(promotionCounts)}；完成状态 ${JSON.stringify(completionCounts)}`);
}

if (!apply) {
  console.log(`校验通过：${rows.length} 条记录，${linked} 个项目文档链接，${rows.length - linked} 条待补链接。`);
  console.log(`推广状态：非推广 ${promotionCounts.none}、待推广 ${promotionCounts.pending}、测试中 ${promotionCounts.testing}、放量中 ${promotionCounts.scaling}、已结束 ${promotionCounts.ended}。`);
  console.log(`完成状态：待发布 ${completionCounts.pending}、按时发布 ${completionCounts.on_time}、延期发布 ${completionCounts.delayed}；${rows.filter((row) => row.completionStatusCorrected).length} 条按时间纠正。`);
  console.log('这是只读预检；确认开发数据库迁移完成后，使用 pnpm db:import -- --apply 写入。');
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error('缺少 DATABASE_URL');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  let inserted = 0;
  await sql.begin(async (transaction) => {
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
  console.log(`导入完成：新增 ${inserted} 条，跳过 ${rows.length - inserted} 条已导入记录。`);
} finally {
  await sql.end();
}
