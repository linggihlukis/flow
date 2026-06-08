'use strict';
const fs   = require('node:fs');
const path = require('node:path');
const { resolveSafePath } = require('./path-resolver');
const { getConfigValue } = require('./config');
const { output, exitErr, getCwd } = require('./_cli-utils');

const MODEL_CONTEXT_LIMIT_DEFAULT = 200000;

function cmdContextTraceAvg(args) {
  const cwd = getCwd(args);
  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx >= 0 ? args[fileIdx + 1] : null;

  if (!filePath) exitErr('PATH_NOT_FOUND', '--file is required for context trace-avg');

  const resolved = resolveSafePath(cwd, filePath);
  if (!fs.existsSync(resolved)) {
    return output({ avg_tokens: 0, total_entries: 0, total_tokens: 0 });
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const lines = content.split('\n');

  let inTable = false;
  const tokens = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|[\s\-:]+\|[\s\-:]+\|/.test(trimmed)) {
      inTable = true;
      continue;
    }
    if (!inTable && trimmed.startsWith('|')) {
      inTable = true;
      continue;
    }
    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim());
      for (const idx of [2, 3]) {
        if (idx < cells.length) {
          const cell = cells[idx].replace(/,/g, '');
          if (/^\d+$/.test(cell)) {
            tokens.push(parseInt(cell, 10));
            break;
          }
        }
      }
    } else if (inTable && !trimmed.startsWith('|')) {
      break;
    }
  }

  const total = tokens.reduce((sum, t) => sum + t, 0);
  const avg = tokens.length > 0 ? Math.round(total / tokens.length) : 0;

  return output({ avg_tokens: avg, total_entries: tokens.length, total_tokens: total });
}

function cmdContextEstimate(args) {
  const cwd = getCwd(args);
  const paths = args.filter(a => !a.startsWith('--'));
  const modelContextLimit = getConfigValue(cwd, 'context.model_context_limit', MODEL_CONTEXT_LIMIT_DEFAULT);

  const perFile = [];
  let totalChars = 0;

  for (const p of paths) {
    const resolved = resolveSafePath(cwd, p);
    if (!fs.existsSync(resolved)) {
      perFile.push({ path: p, chars: 0, tokens: 0, error: 'not found' });
      continue;
    }
    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const chars = content.length;
      // Rough token estimate: ~4 chars per token for English prose.
// Can be 2-5x off for dense code, non-English text, or long identifiers.
// Sufficient for budget-check heuristics, not for precise counting.
const tokens = Math.round(chars / 4);
      totalChars += chars;
      perFile.push({ path: p, chars, tokens });
    } catch {
      perFile.push({ path: p, chars: 0, tokens: 0, error: 'unreadable' });
    }
  }

  // See note above — chars/4 is a rough approximation
  const estimatedTokens = Math.round(totalChars / 4);
  const budgetPct = modelContextLimit > 0 ? Math.round((estimatedTokens / modelContextLimit) * 1000) / 10 : 0;

  if (args.includes('--budget-check')) {
    const lowPct  = getConfigValue(cwd, 'context.budget_low_pct', 70);
    const critPct = getConfigValue(cwd, 'context.budget_critical_pct', 90);
    const usagePct = (estimatedTokens / modelContextLimit) * 100;
    const status = usagePct >= critPct ? 'critical' : usagePct >= lowPct ? 'warning' : 'ok';
    return output({ tokens: estimatedTokens, budget_status: status, usage_pct: Math.round(usagePct), limit: modelContextLimit });
  }

  return output({
    total_chars: totalChars,
    estimated_tokens: estimatedTokens,
    fits_budget: estimatedTokens <= modelContextLimit,
    budget_pct: budgetPct,
    per_file: perFile,
  });
}

function execute(args) {
  const sub = args[0];
  if (sub === 'trace-avg') return cmdContextTraceAvg(args.slice(1));
  if (sub === 'estimate')  return cmdContextEstimate(args.slice(1));
  throw { code: 'UNKNOWN_COMMAND', message: `Unknown context subcommand: ${sub}` };
}

module.exports = { execute };
