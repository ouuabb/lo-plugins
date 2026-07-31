/**
 * 去重工具：基于 recordId 去重
 * 用于双通道同步（HTTP + 文件）时防止重复创建 Resource
 */

/**
 * 从已有 Resources 中提取 recordId 集合
 * @param {Array} resources — 已有 Resource 列表
 * @returns {Set<string>} recordId 集合
 */
function extractRecordIds(resources) {
  const ids = new Set();
  for (const r of resources) {
    const rid = (r.metadata && r.metadata.recordId) || r.recordId;
    if (rid) ids.add(rid);
  }
  return ids;
}

/**
 * 过滤出尚未同步的记录
 * @param {Array} records — 待检查的翻译记录
 * @param {Set<string>} existingIds — 已存在的 recordId 集合
 * @returns {Array} 需要创建的记录
 */
function filterUnsynced(records, existingIds) {
  return records.filter(r => !existingIds.has(r.recordId));
}

module.exports = { extractRecordIds, filterUnsynced };
