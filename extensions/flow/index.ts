/**
 * Flow — native Pi package extension.
 *
 * Registers exactly two tools:
 *   flow_tools — deterministic Flow operations over the package-local CLI.
 *   flow_agent — single-role delegation to an isolated Pi child session.
 *
 * Child sessions (PI_FLOW_CHILD_ROLE set) keep flow_tools but never re-register
 * flow_agent, so Flow roles cannot delegate recursively. The generic subagent
 * extension, user commands, trust handling, and active-tool selection are left
 * untouched. If another extension already owns a Flow tool name, registration
 * fails closed instead of silently using the wrong implementation.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { discoverFlowAgents, getFlowAgent } from "./agents.ts";
import { registerFlowTools } from "./tools.ts";
import { runFlowChild } from "./runner.ts";

const CHILD_ROLE_BY_AGENT: Record<string, string> = {
	"flow-planner": "planner",
	"flow-executor": "executor",
	"flow-reviewer": "reviewer",
};

function registerFlowAgent(pi: ExtensionAPI) {
	pi.registerTool({
		name: "flow_agent",
		label: "Flow Agent",
		description:
			"Delegate one Flow role (flow-planner, flow-executor, or flow-reviewer) to an isolated Pi child session. " +
			"The child keeps flow_tools but cannot delegate further. Single role per call; no arbitrary agent names and no caller-chosen working directory.",
		parameters: Type.Object({
			role: Type.Union(
				[
					Type.Literal("flow-planner"),
					Type.Literal("flow-executor"),
					Type.Literal("flow-reviewer"),
				],
				{ description: "Fixed Flow role to run" },
			),
			task: Type.String({ description: "Self-contained assignment for the role" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const input = params as { role: string; task: string };
			const agents = discoverFlowAgents();
			const agent = getFlowAgent(agents, input.role);
			if (!agent) {
				throw new Error(`flow_agent: unknown role '${input.role}'. Available roles: ${agents.map((a) => a.name).join(", ")}.`);
			}

			const output = await runFlowChild({
				role: CHILD_ROLE_BY_AGENT[agent.name],
				agent,
				task: input.task,
				cwd: ctx.cwd,
				model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				thinkingLevel: ctx.thinkingLevel,
				signal,
				onOutput: (text) =>
					onUpdate?.({ content: [{ type: "text", text: text || "(running…)" }], details: { role: agent.name } }),
			});

			return { content: [{ type: "text", text: output }], details: { role: agent.name } };
		},
	});
}

export default function flowExtension(pi: ExtensionAPI) {
	const childRole = process.env.PI_FLOW_CHILD_ROLE;
	let initialized = false;

	pi.on("session_start", () => {
		if (initialized) return;

		const existingToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
		if (existingToolNames.has("flow_tools")) {
			throw new Error("flow_tools is already provided by another extension; refusing to register a second implementation.");
		}
		if (!childRole && existingToolNames.has("flow_agent")) {
			throw new Error("flow_agent is already provided by another extension; refusing to register a second implementation.");
		}

		registerFlowTools(pi);
		if (!childRole) registerFlowAgent(pi);
		initialized = true;
	});
}
