/**
 * Package-local discovery of the three fixed Flow roles.
 *
 * Discovery reads only the pinned files shipped inside this package. It never
 * scans user or project agent directories, so Flow roles cannot be overridden
 * or replaced by unrelated agent definitions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export interface AgentConfig {
	name: string;
	description: string;
	tools: string[];
	systemPrompt: string;
	filePath: string;
}

const AGENT_FILES = ["flow-planner.md", "flow-executor.md", "flow-reviewer.md"] as const;

function agentsDir(): string {
	return path.join(path.dirname(fileURLToPath(import.meta.url)), "agents");
}

function parseToolList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	return raw.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

export function discoverFlowAgents(dir: string = agentsDir()): AgentConfig[] {
	const agents: AgentConfig[] = [];
	for (const fileName of AGENT_FILES) {
		const filePath = path.join(dir, fileName);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			throw new Error(`flow_agent: missing role definition: ${filePath}`);
		}

		const expectedName = fileName.replace(/\.md$/, "");
		const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(content);

		if (typeof frontmatter.name !== "string" || frontmatter.name !== expectedName) {
			throw new Error(`flow_agent: role file ${fileName} must declare frontmatter name: ${expectedName}`);
		}
		if (typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
			throw new Error(`flow_agent: role file ${fileName} must declare a non-empty description`);
		}
		const tools = parseToolList(frontmatter.tools);
		if (tools.length === 0) {
			throw new Error(`flow_agent: role file ${fileName} must declare a non-empty tools list`);
		}
		if (!body.trim()) {
			throw new Error(`flow_agent: role file ${fileName} has an empty body`);
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools,
			systemPrompt: body,
			filePath,
		});
	}
	return agents;
}

export function getFlowAgent(agents: AgentConfig[], name: string): AgentConfig | undefined {
	return agents.find((agent) => agent.name === name);
}
