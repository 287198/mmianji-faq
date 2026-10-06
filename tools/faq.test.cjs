const test = require('node:test'), assert = require('node:assert/strict');
const { mergeContribution, selectForVersion } = require('./faq.cjs');
const blank = () => ({ format: 'mmianji-public-faq', version: 1, entries: [] });
const contribution = (version, answer = '打开全局美化仓库，选择导入文件。') => ({ format: 'mmianji-faq-contribution', version: 1, purpose: 'public-faq', consent: { publicKnowledge: true, assistantQA: true }, cases: [{ module: 'appearance', question: '如何导入全局美化？', answer, appVersion: version, verification: 'answered-not-confirmed' }] });
test('需维护者审阅与明确版本核验；不导入内部工具过程或额外身份字段', () => {
  assert.throws(() => mergeContribution(blank(), contribution('v1')), /审阅/);
  assert.throws(() => mergeContribution(blank(), contribution('v1'), { reviewed: true, verifiedVersion: 'v2' }), /版本/);
  assert.throws(() => mergeContribution(blank(), contribution('v1', '先调用 read_object 再 propose_changes'), { reviewed: true, verifiedVersion: 'v1' }), /合规/);
  const doc = contribution('v1'); doc.cases[0].tools = ['read_source'];
  assert.throws(() => mergeContribution(blank(), doc, { reviewed: true, verifiedVersion: 'v1' }), /字段/);
});
test('同版本去重与冲突检测，跨版本答案隔离，过期答案不召回', () => {
  const v1 = mergeContribution(blank(), contribution('v1'), { reviewed: true, verifiedVersion: 'v1' });
  const dedup = mergeContribution(v1, contribution('v1'), { reviewed: true, verifiedVersion: 'v1' });
  assert.equal(dedup.entries.length, 1); assert.equal(dedup.entries[0].answers.length, 1);
  assert.throws(() => mergeContribution(v1, contribution('v1', '新版在设置中的外观页导入。'), { reviewed: true, verifiedVersion: 'v1' }), /冲突/);
  const v2 = mergeContribution(v1, contribution('v2', '新版在设置中的外观页导入。'), { reviewed: true, verifiedVersion: 'v2' });
  assert.equal(v2.entries.length, 1); assert.equal(v2.entries[0].answers.length, 2);
  assert.match(selectForVersion(v2, 'v1').cases[0].answer, /仓库/); assert.match(selectForVersion(v2, 'v2').cases[0].answer, /外观页/);
  assert.equal(selectForVersion(v2).needsVersion, true);
  v2.entries[0].answers[0].reviewStatus = 'retired'; assert.equal(selectForVersion(v2, 'v1').cases.length, 0);
});
