/**
 * 生成翻译记录唯一 ID
 * 格式: tr_<timestamp>_<random>
 */

let counter = 0;

function generateRecordId() {
  const ts = Date.now().toString(36);
  const rand = (counter++).toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `tr_${ts}_${rand}${random}`;
}

module.exports = { generateRecordId };
