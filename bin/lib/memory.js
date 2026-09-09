'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { output, exitErr, getCwd, requireActor } = require('./_cli-utils');

const VALID_ACTIONS = new Set(['add', 'update', 'supersede', 'none']);
const MEMORY_SECTIONS = ['Facts', 'Decisions', 'Lessons'];
const MAX_MEMORY_BYTES = 256 * 1024;
const MAX_PROPOSAL_VALUE = 8 * 1024;
const APPROVED_VALUES = new Set(['approved', 'true']);

function normalizeFact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function factWithoutEvidence(value) {
  return normalizeFact(value).replace(/\s+\([^()]*\)\s*$/, '').trim();
}

function memoryPath(cwd) {
  return path.join(cwd, '.flow', 'memory.md');
}

function applyApprovedMemoryProposal(cwd, proposal, explicitlyApproved = false) {
  if (!proposal || String(proposal.action || 'none').toLowerCase() === 'none') return { applied: false, action: 'none' };
  if (explicitlyApproved !== true) {
    return { applied: false, action: proposal.action, skipped: 'explicit Flow approval is required; Reviewer output is only a proposal' };
  }
  const fields = [
    ['--action', proposal.action],
    ['--section', proposal.section || 'Facts'],
    ['--target', proposal.target],
    ['--fact', proposal.fact],
    ['--evidence', proposal.evidence],
    ['--reason', proposal.reason],
    ['--expected-memory-digest', proposal.expectedMemoryDigest || proposal.expected_memory_digest],
    ['--approval', 'approved'],
    ['--actor', 'flow'],
    ['--cwd', cwd],
  ].filter(([, value]) => value !== undefined && value !== null);
  return execute(['apply', ...fields.flatMap(pair => pair)]);
}

function readMemory(cwd) {
  const filePath = memoryPath(cwd);
  if (!fs.existsSync(filePath)) exitErr('PATH_NOT_FOUND', '.flow/memory.md not found');
  const content = fs.readFileSync(filePath, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > MAX_MEMORY_BYTES) exitErr('INVALID_VALUE', 'memory.md exceeds the input limit');
  return { path: filePath, content };
}

function parseMemory(content) {
  const lines = String(content).split(/\r?\n/);
  const sections = new Map();
  const duplicates = [];
  let current = null;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^##\s+(Facts|Decisions|Lessons)\s*$/i);
    if (match) {
      const name = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      if (sections.has(name)) duplicates.push(name);
      current = { name, headingIndex: index, entries: [] };
      sections.set(name, current);
      continue;
    }
    if (!current) continue;
    const bullet = lines[index].match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet) current.entries.push({
      section: current.name,
      lineIndex: index,
      raw: bullet[1].trim(),
      fact: factWithoutEvidence(bullet[1]),
    });
  }
  return { lines, sections, duplicates, entries: [...sections.values()].flatMap(section => section.entries) };
}

function isNegativeFact(value) {
  return /\b(?:does not|do not|is not|are not|cannot|can't|isn't|doesn't|never|not|without|disabled|unsupported)\b/i.test(value);
}

function canonicalFact(value) {
  return normalizeFact(value)
    .toLowerCase()
    .replace(/\b(?:does not|do not|is not|are not|cannot|can't|isn't|doesn't|never|not|without|disabled|unsupported)\b/g, ' ')
    .replace(/\b(uses|supports|allows|writes|reads|requires)\b/g, word => word.slice(0, -1))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findContradictions(entries) {
  const contradictions = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (canonicalFact(entries[i].fact) && canonicalFact(entries[i].fact) === canonicalFact(entries[j].fact) && isNegativeFact(entries[i].fact) !== isNegativeFact(entries[j].fact)) {
        contradictions.push({ first: entries[i].fact, second: entries[j].fact });
      }
    }
  }
  return contradictions;
}

function validateMemoryContent(content) {
  const parsed = parseMemory(content);
  const errors = [];
  for (const section of MEMORY_SECTIONS) if (!parsed.sections.has(section)) errors.push(`memory.md is missing ## ${section}`);
  for (const duplicate of parsed.duplicates) errors.push(`memory.md has duplicate ## ${duplicate} sections`);
  const seen = new Set();
  const duplicates = [];
  for (const entry of parsed.entries) {
    const key = entry.fact.toLowerCase();
    if (seen.has(key)) duplicates.push(entry.fact);
    seen.add(key);
  }
  const contradictions = findContradictions(parsed.entries);
  if (duplicates.length) errors.push(`duplicate facts: ${duplicates.join('; ')}`);
  if (contradictions.length) errors.push(`contradictory facts: ${contradictions.map(pair => `${pair.first} / ${pair.second}`).join('; ')}`);
  const unresolved = parsed.entries.filter(entry => /\bunresolved\b/i.test(entry.raw));
  if (unresolved.length) errors.push('unresolved discoveries cannot remain in durable memory');
  return {
    valid: errors.length === 0,
    facts: parsed.entries.length,
    duplicates,
    contradictions,
    hasUnresolved: unresolved.length > 0,
    errors,
    parsed,
  };
}

function getRawFlag(args, flagName) {
  const index = args.indexOf(flagName);
  if (index < 0) return null;
  if (index + 1 >= args.length || String(args[index + 1]).startsWith('--')) return '';
  return String(args[index + 1]);
}

function boundedValue(value, field, errors, { required = false } = {}) {
  if (value === null || value === '') {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  if (value.length > MAX_PROPOSAL_VALUE || /[\u0000\n\r]/.test(value)) errors.push(`${field} must be a bounded single-line value`);
  return value.trim();
}

function parseProposal(args) {
  const errors = [];
  const action = boundedValue(getRawFlag(args, '--action'), '--action', errors, { required: true });
  const fact = boundedValue(getRawFlag(args, '--fact'), '--fact', errors, { required: false });
  const target = boundedValue(getRawFlag(args, '--target'), '--target', errors, { required: false });
  const evidence = boundedValue(getRawFlag(args, '--evidence'), '--evidence', errors, { required: false });
  const reason = boundedValue(getRawFlag(args, '--reason'), '--reason', errors, { required: false });
  const section = boundedValue(getRawFlag(args, '--section'), '--section', errors, { required: false }) || 'Facts';
  const approval = boundedValue(getRawFlag(args, '--approval'), '--approval', errors, { required: false });
  const expectedDigest = boundedValue(getRawFlag(args, '--expected-memory-digest'), '--expected-memory-digest', errors, { required: false });

  if (action && !VALID_ACTIONS.has(action)) errors.push('action must be one of add, update, supersede, none');
  if (!MEMORY_SECTIONS.includes(section)) errors.push(`section must be one of ${MEMORY_SECTIONS.join(', ')}`);
  if (action !== 'none') {
    if (!fact) errors.push('--fact is required for a memory change');
    if (!evidence) errors.push('--evidence is required for a memory change');
    if (!reason) errors.push('--reason is required for a memory change');
    if (!expectedDigest) errors.push('--expected-memory-digest is required for a memory change');
    if (approval === null || !APPROVED_VALUES.has(String(approval).toLowerCase())) errors.push('--approval approved is required for a memory change');
    if (fact && /\bunresolved\b/i.test(fact)) errors.push('unresolved discoveries must not be promoted to durable memory');
    if (evidence && /\bunresolved\b/i.test(evidence)) errors.push('unresolved evidence must not be promoted to durable memory');
    if (reason && /\bunresolved\b/i.test(reason)) errors.push('unresolved discoveries must not be promoted to durable memory');
    if ((action === 'update' || action === 'supersede') && !target) errors.push(`--target is required for ${action}`);
    if (action === 'add' && target) errors.push('--target is only valid for update or supersede');
  }
  if (expectedDigest && !/^[0-9a-f]{64}$/i.test(expectedDigest)) errors.push('--expected-memory-digest must be a SHA-256 digest');
  return {
    valid: errors.length === 0,
    errors,
    proposal: { action, fact: fact ? normalizeFact(fact) : null, target: target ? normalizeFact(target) : null, evidence, reason, section, approval, expectedDigest },
  };
}

function validateProposal(proposal, currentContent) {
  const current = validateMemoryContent(currentContent);
  const errors = [...current.errors];
  const { action, fact, target, section, expectedDigest } = proposal;
  const digest = crypto.createHash('sha256').update(currentContent).digest('hex');
  if (action === 'none') return { valid: errors.length === 0, action, digest, errors };
  if (!fact) return { valid: false, action, digest, errors: [...errors, 'fact is required'] };
  const entries = current.parsed.entries;
  const targetEntry = target ? entries.find(entry => entry.fact.toLowerCase() === target.toLowerCase()) : null;
  if ((action === 'update' || action === 'supersede') && !targetEntry) errors.push(`target fact not found: ${target}`);
  if (targetEntry && section !== targetEntry.section) errors.push(`target fact belongs to ## ${targetEntry.section}, not ## ${section}`);
  const comparableEntries = targetEntry ? entries.filter(entry => entry !== targetEntry) : entries;
  if (comparableEntries.some(entry => entry.fact.toLowerCase() === fact.toLowerCase())) errors.push('fact already exists — use update or supersede');
  if (comparableEntries.some(entry => canonicalFact(entry.fact) === canonicalFact(fact) && isNegativeFact(entry.fact) !== isNegativeFact(fact))) errors.push('fact contradicts current durable memory — use update or supersede with an explicit target');
  if (expectedDigest && expectedDigest !== digest) errors.push('memory digest is stale');
  return { valid: errors.length === 0, action, digest, target: targetEntry?.fact || null, errors };
}

function withMemoryLock(filePath, fn) {
  const lockPath = `${filePath}.lock`;
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); }
  catch { throw { code: 'WRITE_FAILED', message: 'memory.md is locked by another process — retry in a moment' }; }
  try { return fn(); }
  finally { try { fs.closeSync(fd); fs.unlinkSync(lockPath); } catch {} }
}

function renderMemoryChange(content, proposal) {
  const parsed = parseMemory(content);
  const target = proposal.target ? parsed.entries.find(entry => entry.fact.toLowerCase() === proposal.target.toLowerCase()) : null;
  const section = target?.section || proposal.section;
  const evidence = proposal.evidence ? ` (evidence: ${proposal.evidence})` : '';
  const replacement = `- ${proposal.fact}${evidence}`;
  const lines = [...parsed.lines];
  if (target) {
    lines[target.lineIndex] = replacement;
  } else {
    const sectionData = parsed.sections.get(section);
    if (!sectionData) throw { code: 'INVALID_VALUE', message: `memory.md is missing ## ${section}` };
    let insertAt = lines.length;
    for (let index = sectionData.headingIndex + 1; index < lines.length; index++) {
      if (/^##\s+/.test(lines[index])) { insertAt = index; break; }
    }
    while (insertAt > sectionData.headingIndex + 1 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, replacement, '');
  }
  let result = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  if (!result.endsWith('\n')) result += '\n';
  return result;
}

function writeAtomically(filePath, content) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw { code: 'WRITE_FAILED', message: `Failed to write memory.md: ${error.message}` };
  }
}

function proposalFailure(validation) {
  exitErr(validation.errors.some(error => /stale/i.test(error)) ? 'STALE_MEMORY' : 'INVALID_VALUE', validation.errors.join('; '));
}

function cmdCheck(args) {
  const cwd = getCwd(args);
  const { content } = readMemory(cwd);
  const checked = validateMemoryContent(content);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  return output({ valid: checked.valid, facts: checked.facts, duplicates: checked.duplicates, contradictions: checked.contradictions, hasUnresolved: checked.hasUnresolved, errors: checked.errors, digest });
}

function cmdValidate(args) {
  const cwd = getCwd(args);
  const { content } = readMemory(cwd);
  const parsed = parseProposal(args);
  if (!parsed.valid) return output({ valid: false, action: parsed.proposal.action, errors: parsed.errors });
  const validation = validateProposal(parsed.proposal, content);
  return output({ valid: validation.valid, action: validation.action, target: validation.target || null, errors: validation.errors, digest: validation.digest });
}

function cmdApply(args) {
  requireActor(args, 'flow');
  const cwd = getCwd(args);
  const parsed = parseProposal(args);
  if (!parsed.valid) proposalFailure(parsed);
  const { action } = parsed.proposal;
  if (action === 'none') {
    const { content } = readMemory(cwd);
    const current = validateMemoryContent(content);
    if (!current.valid) proposalFailure({ errors: current.errors });
    return output({ applied: false, action: 'none', digest: crypto.createHash('sha256').update(content).digest('hex') });
  }
  const filePath = memoryPath(cwd);
  return withMemoryLock(filePath, () => {
    const content = fs.readFileSync(filePath, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_MEMORY_BYTES) exitErr('INVALID_VALUE', 'memory.md exceeds the input limit');
    const validation = validateProposal(parsed.proposal, content);
    if (!validation.valid) proposalFailure(validation);
    const updated = renderMemoryChange(content, parsed.proposal);
    writeAtomically(filePath, updated);
    return output({ applied: true, action, fact: parsed.proposal.fact, target: validation.target || null, section: parsed.proposal.section, expected_memory_digest: validation.digest, digest: crypto.createHash('sha256').update(updated).digest('hex') });
  });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'check') return cmdCheck(args.slice(1));
  if (sub === 'validate') return cmdValidate(args.slice(1));
  if (sub === 'apply') return cmdApply(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown memory subcommand: ${sub}` };
}

module.exports = {
  execute,
  normalizeFact,
  parseMemory,
  validateMemoryContent,
  parseProposal,
  validateProposal,
  renderMemoryChange,
  withMemoryLock,
  memoryPath,
  applyApprovedMemoryProposal,
};
