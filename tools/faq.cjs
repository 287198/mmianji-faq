'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const normalize = text => String(text).normalize('NFKC').toLowerCase().replace(/[\s，。！？：；、,.!?:;“”‘’()（）「」【】]/g, '');
const idFor = item => 'faq-' + crypto.createHash('sha256').update(item.module + '\n' + normalize(item.question)).digest('hex').slice(0, 20);
function safeText(text) {
  return typeof text === 'string' && text.trim().length >= 4 && text.length <= 700 &&
    !/```|https?:\/\/|[\w.+-]+@[\w.-]+|\b1[3-9]\d{9}\b|\bsk-[\w-]+|(?:api[_-]?key|token|password)\s*[:=]|\[(?:身份|凭据|地址|路径|手机号|邮箱|证件号)已隐藏\]|\b(?:read_object|propose_changes|propose_text_patch|inspect_current_view|load_capability|remember_solution|tool_call|candidateId|read_source|search_source)\b|::(?:before|after)|!important|(?:调用|执行|使用).{0,12}(?:工具|副\s*API)/i.test(text);
}
function mergeContribution(kb, doc, options = {}) {
  if (!options.reviewed || !options.verifiedVersion || options.verifiedVersion === 'unknown' || /BUILD_VERSION/.test(options.verifiedVersion)) throw new Error('必须审阅隐私及通用性，并实际核验明确的应用版本');
  if (!kb || kb.format !== 'mmianji-public-faq' || kb.version !== 1 || !Array.isArray(kb.entries)) throw new Error('知识库格式错误');
  if (!doc || doc.format !== 'mmianji-faq-contribution' || doc.version !== 1 || doc.purpose !== 'public-faq' || doc.consent?.publicKnowledge !== true || doc.consent?.assistantQA !== true || !Array.isArray(doc.cases) || !doc.cases.length || doc.cases.length > 40) throw new Error('贡献格式或公开用途同意无效');
  const output = structuredClone(kb);
  for (const item of doc.cases) {
    if (Object.keys(item).some(k => !['module', 'question', 'answer', 'appVersion', 'verification'].includes(k))) throw new Error('贡献含有非公开问答字段');
    if (!safeText(item.question) || !safeText(item.answer) || typeof item.module !== 'string' || !/^[a-z-]{1,40}$/.test(item.module) || item.appVersion !== options.verifiedVersion) throw new Error('问答不合规或适用版本与核验版本不一致');
    let entry = output.entries.find(e => e.module === item.module && [e.question, ...(e.aliases || [])].some(q => normalize(q) === normalize(item.question)));
    if (!entry) { entry = { id: idFor(item), module: item.module, question: item.question, aliases: [], answers: [] }; output.entries.push(entry); }
    const existing = entry.answers.find(a => a.appVersions.includes(item.appVersion));
    if (existing) {
      if (normalize(existing.answer) !== normalize(item.answer)) throw new Error('同版本答案冲突，需人工核验；没有覆盖旧答案');
      continue;
    }
    entry.answers.push({ appVersions: [item.appVersion], answer: item.answer, reviewStatus: 'approved', verification: 'maintainer-verified', verifiedAt: new Date().toISOString().slice(0, 10) });
  }
  return output;
}
function selectForVersion(kb, appVersion) {
  if (!appVersion || appVersion === 'unknown' || /BUILD_VERSION/.test(appVersion)) return { needsVersion: true, cases: [] };
  const cases = [];
  for (const entry of kb.entries || []) {
    const answers = (entry.answers || []).filter(a => a.reviewStatus === 'approved' && a.appVersions.includes(appVersion));
    if (answers.length === 1) cases.push({ module: entry.module, question: entry.question, aliases: entry.aliases || [], answer: answers[0].answer, appVersion });
  }
  return { needsVersion: false, cases };
}
module.exports = { mergeContribution, selectForVersion };
if (require.main === module) {
  try {
    const [, , input, target, ...args] = process.argv;
    if (!input || !target) throw new Error('用法: node tools/faq.cjs contribution.json knowledge/faqs.json --reviewed --verified-version=版本');
    const options = { reviewed: args.includes('--reviewed'), verifiedVersion: args.find(a => a.startsWith('--verified-version='))?.slice('--verified-version='.length) };
    const output = mergeContribution(JSON.parse(fs.readFileSync(target, 'utf8')), JSON.parse(fs.readFileSync(input, 'utf8')), options);
    fs.writeFileSync(target, JSON.stringify(output, null, 2) + '\n');
    console.log('已合并经审核且适用版本明确的通用问答');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
