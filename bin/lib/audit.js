'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('./frontmatter');
const { output, exitErr, getCwd } = require('./_cli-utils');

function cmdAuditOpen(args) {
  const cwd = getCwd(args);
  const drift = [];
  const statePath = path.join(cwd, '.flow', 'state.md');
  if (!fs.existsSync(statePath)) { drift.push({ field: 'state.md', expected: 'exists', actual: 'not found' }); return output({ valid: false, drift }); }
  const stateContent = fs.readFileSync(statePath, 'utf8');
  const fm = parseFrontmatter(stateContent);
  if (!fm) { drift.push({ field: 'state.md', expected: 'valid frontmatter', actual: 'parse error' }); return output({ valid: false, drift }); }
  const requiredFields = ['active_milestone', 'active_phase', 'status'];
  for (const field of requiredFields) { if (fm[field] === undefined || fm[field] === null) drift.push({ field: `state.${field}`, expected: 'present', actual: 'missing' }); }
  const mName = fm.active_milestone;
  if (!mName) { console.error('Warning: active_milestone not set in state.md'); return output({ valid: false, drift: [{ field: 'active_milestone', expected: 'present', actual: 'missing' }] }); }
  const milestoneDir = path.join(cwd, '.flow', 'milestones', String(mName));
  if (!fs.existsSync(milestoneDir)) drift.push({ field: 'milestone_dir', expected: `milestones/${mName} exists`, actual: 'not found' });
  const roadmapPath = path.join(cwd, '.flow', 'milestones', String(mName), 'roadmap.md');
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
    const phaseMatches = roadmapContent.match(/^###\s+Phase\s+(\d+)/gm);
    if (phaseMatches) { for (const match of phaseMatches) { const num = match.match(/Phase\s+(\d+)/)[1]; const padded = String(num).padStart(2, '0'); const phaseDir = path.join(cwd, '.flow', 'milestones', String(mName), 'phases', `phase-${padded}`); if (!fs.existsSync(phaseDir)) drift.push({ field: `phase-${padded}`, expected: 'directory exists', actual: 'not found' }); else { const cp = path.join(phaseDir, 'CONTEXT.md'); if (!fs.existsSync(cp)) drift.push({ field: `phase-${padded}/CONTEXT.md`, expected: 'exists', actual: 'not found' }); } } }
  }
  return output({ valid: drift.length === 0, drift });
}

function execute(args) { const sub = args[0]; if (sub === 'open') return cmdAuditOpen(args.slice(1)); throw { code: 'UNKNOWN_COMMAND', message: `Unknown audit subcommand: ${sub}` }; }
module.exports = { execute };
