'use strict';

const ROLE_NAMES = new Set(['flow-planner', 'flow-executor', 'flow-reviewer']);

class RuntimeCapabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuntimeCapabilityError';
    this.code = code;
  }
}

function probeAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new RuntimeCapabilityError('RUNTIME_ADAPTER_UNAVAILABLE', 'Flow requires an injected native runtime adapter');
  }
  if (adapter.capabilities?.subagentSpawn !== true) {
    throw new RuntimeCapabilityError('SUBAGENT_SPAWN_UNAVAILABLE', 'The injected runtime adapter does not provide native subagent spawning');
  }
  if (typeof adapter.spawn !== 'function') {
    throw new RuntimeCapabilityError('RUNTIME_ADAPTER_INVALID', 'The runtime adapter must implement spawn(request)');
  }
  return { ...adapter.capabilities, verified: true };
}

async function spawnChild(adapter, { role, workItem, task = null, context = {} } = {}) {
  probeAdapter(adapter);
  if (!ROLE_NAMES.has(role)) throw new RuntimeCapabilityError('INVALID_ROLE', `Unsupported Flow child role '${role}'`);
  if (!workItem || typeof workItem !== 'object') throw new RuntimeCapabilityError('INVALID_SPAWN_REQUEST', 'A Work Item is required for child spawning');
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new RuntimeCapabilityError('INVALID_SPAWN_REQUEST', 'Child context must be an object');
  return await adapter.spawn({ role, workItem, task, context });
}

module.exports = { ROLE_NAMES, RuntimeCapabilityError, probeAdapter, spawnChild };
