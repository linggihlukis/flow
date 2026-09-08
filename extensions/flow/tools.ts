/**
 * flow_tools — native Pi tool over the package-local deterministic CLI.
 *
 * The extension owns cwd, actor, approval, and the protected-branch override.
 * It invokes only the package-local bin/flow-tools.js through node (no shell)
 * and never falls back to the legacy global tool copy.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import operations from "./operations.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FLOW_TOOLS_PATH = path.join(PACKAGE_ROOT, "bin", "flow-tools.js");
const CLI_TIMEOUT_MS = 120_000;
const MAX_CLI_OUTPUT_CHARS = 1_000_000;

const PROTECTED_BRANCH_PATTERN = /protected branch .* requires explicit confirmation/;

interface CliResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
}

function parseCliJson(result: CliResult): any {
	const text = typeof result.stdout === "string" ? result.stdout.trim() : "";
	if (!text) {
		throw new Error(result.killed ? "flow_tools: CLI run was killed (timeout or abort)." : "flow_tools: CLI returned no output.");
	}
	let parsed: any;
	try {
		parsed = JSON.parse(text);
	} catch {
		try {
			parsed = JSON.parse(text.split(/\r?\n/)[0]);
		} catch {
			throw new Error(`flow_tools: CLI returned non-JSON output: ${text.slice(0, 200)}`);
		}
	}
	if (parsed && typeof parsed === "object" && parsed.error === true) {
		throw new Error(`flow_tools ${parsed.code || "CLI_ERROR"}: ${parsed.message || "deterministic operation failed"}`);
	}
	return parsed;
}

async function execFlowCli(pi: ExtensionAPI, args: string[], cwd: string, signal?: AbortSignal): Promise<any> {
	if (signal?.aborted) throw new Error("flow_tools: aborted before execution.");
	const result = await pi.exec(process.execPath, [FLOW_TOOLS_PATH, ...args, "--cwd", cwd], {
		cwd,
		signal,
		timeout: CLI_TIMEOUT_MS,
	});
	const stdout = typeof result.stdout === "string" ? result.stdout : "";
	if (stdout.length > MAX_CLI_OUTPUT_CHARS) {
		throw new Error("flow_tools: CLI output exceeded the bounded size limit.");
	}
	const parsed = parseCliJson({ ...result, stdout });
	if (result.code !== 0) {
		const stderr = typeof result.stderr === "string" ? result.stderr.trim().slice(0, 300) : "";
		throw new Error(`flow_tools: CLI exited with code ${result.code}.${stderr ? ` ${stderr}` : ""}`);
	}
	return parsed;
}

function gateNeedsProtectedBranchConfirmation(result: any): boolean {
	const messages: string[] = [];
	if (Array.isArray(result?.errors)) messages.push(...result.errors);
	if (Array.isArray(result?.git?.errors)) messages.push(...result.git.errors);
	return messages.some((message) => typeof message === "string" && PROTECTED_BRANCH_PATTERN.test(message));
}

function describeApproval(params: Record<string, unknown>): string {
	return [
		`Action: ${params.action}`,
		params.section ? `Section: ${params.section}` : "",
		params.fact ? `Fact: ${String(params.fact).slice(0, 200)}` : "",
		params.target ? `Target: ${String(params.target).slice(0, 200)}` : "",
		params.reason ? `Reason: ${String(params.reason).slice(0, 200)}` : "",
	].filter(Boolean).join("\n");
}

function textResult(parsed: any) {
	return { content: [{ type: "text", text: JSON.stringify(parsed) }], details: parsed };
}

export function registerFlowTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "flow_tools",
		label: "Flow Tools",
		description: [
			"Run one deterministic Flow operation against the current project (.flow/ state, tasks, map, memory, work items).",
			`operation: one of ${Object.keys(operations.OPERATIONS).join(", ")}.`,
			"Operation-specific fields map to Flow CLI flags (for example: workItem, file, executionContext, sets, paths, query, maxResults, input, action, fact, target, evidence, reason, section, expectedMemoryDigest, lineCount, newer, scope, output, symbols, hash, includeHidden, dryRun, force, yes, timeout).",
			"cwd, actor, approval, and protected-branch overrides are injected internally and must not be supplied.",
		].join(" "),
		parameters: Type.Object({
			operation: Type.String({
				description: `Flow operation name. One of: ${Object.keys(operations.OPERATIONS).join(", ")}.`,
			}),
			sets: Type.Optional(Type.Array(Type.String())),
			paths: Type.Optional(Type.Array(Type.String())),
			lineCount: Type.Optional(Type.Boolean()),
			newer: Type.Optional(Type.String()),
			scope: Type.Optional(Type.Array(Type.String())),
			output: Type.Optional(Type.String()),
			symbols: Type.Optional(Type.Boolean()),
			hash: Type.Optional(Type.Boolean()),
			includeHidden: Type.Optional(Type.Boolean()),
			query: Type.Optional(Type.String()),
			maxResults: Type.Optional(Type.Integer()),
			path: Type.Optional(Type.String()),
			file: Type.Optional(Type.String()),
			workItem: Type.Optional(Type.String()),
			executionContext: Type.Optional(Type.Unknown()),
			timeout: Type.Optional(Type.Integer()),
			input: Type.Optional(Type.String()),
			action: Type.Optional(Type.String()),
			fact: Type.Optional(Type.String()),
			target: Type.Optional(Type.String()),
			evidence: Type.Optional(Type.String()),
			reason: Type.Optional(Type.String()),
			section: Type.Optional(Type.String()),
			expectedMemoryDigest: Type.Optional(Type.String()),
			yes: Type.Optional(Type.Boolean()),
			dryRun: Type.Optional(Type.Boolean()),
			force: Type.Optional(Type.Boolean()),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const input = params as Record<string, unknown>;
			const operation = typeof input.operation === "string" ? input.operation : "";
			let baseArgs: string[];
			try {
				baseArgs = operations.buildArgs(operation, input);
			} catch (error) {
				throw new Error(`flow_tools: ${(error as Error).message}`);
			}

			if (operations.requiresApproval(operation, input)) {
				if (!ctx.hasUI) {
					throw new Error("flow_tools: applying a memory proposal requires explicit user approval and no interactive UI is available in this mode.");
				}
				const approved = await ctx.ui.confirm("Apply Flow memory proposal?", describeApproval(input));
				if (!approved) {
					throw new Error("flow_tools: memory proposal was not approved; nothing was applied.");
				}
				return textResult(await execFlowCli(pi, [...baseArgs, "--approval", "approved"], ctx.cwd, signal));
			}

			const result = await execFlowCli(pi, baseArgs, ctx.cwd, signal);

			if (operation === "task_gate" && gateNeedsProtectedBranchConfirmation(result)) {
				if (!ctx.hasUI) {
					throw new Error("flow_tools: committing on a protected branch requires explicit user confirmation and no interactive UI is available in this mode.");
				}
				const approved = await ctx.ui.confirm(
					"Protected-branch commit",
					"The task gate wants to commit on a protected branch (main/master). Allow this commit?",
				);
				if (!approved) {
					throw new Error("flow_tools: protected-branch commit was not confirmed; the task gate remains failed.");
				}
				return textResult(await execFlowCli(pi, [...baseArgs, "--allow-protected-branch"], ctx.cwd, signal));
			}

			return textResult(result);
		},
	});
}
