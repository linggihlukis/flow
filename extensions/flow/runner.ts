/**
 * Isolated single-role child runner.
 *
 * Follows Pi's official subagent example invocation pattern, restricted to one
 * fixed Flow role per call: JSON-mode Pi child, inherited model/thinking,
 * package-owned role prompt, bounded output, abort propagation, and temp-file
 * cleanup. Any failure fails closed — there is no fallback execution path.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentConfig } from "./agents.ts";

export const MAX_CHILD_OUTPUT_BYTES = 50 * 1024;
const MAX_CHILD_STREAM_BYTES = 1_000_000;

export interface RunFlowChildOptions {
	role: string; // planner | executor | reviewer — used for PI_FLOW_CHILD_ROLE
	agent: AgentConfig;
	task: string;
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	signal?: AbortSignal;
	onOutput?: (text: string) => void;
}

interface PiInvocation {
	command: string;
	args: string[];
}

// Same invocation resolution as Pi's official subagent example.
function getPiInvocation(args: string[]): PiInvocation {
	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: process.execPath, args };
	}
	return { command: "pi", args };
}

export function truncateToByteLimit(text: string, limit: number = MAX_CHILD_OUTPUT_BYTES): string {
	if (Buffer.byteLength(text, "utf8") <= limit) return text;
	let out = text.slice(0, limit);
	while (Buffer.byteLength(out, "utf8") > limit) {
		out = out.slice(0, -1);
	}
	return out;
}

function extractAssistantText(message: any): string {
	const parts = Array.isArray(message?.content) ? message.content : [];
	return parts.filter((part: any) => part?.type === "text").map((part: any) => part.text).join("");
}

export async function runFlowChild(options: RunFlowChildOptions): Promise<string> {
	const { agent, task, cwd, signal } = options;

	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (options.model) args.push("--model", options.model);
	if (options.thinkingLevel) args.push("--thinking", options.thinkingLevel);
	if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-flow-agent-"));
	const safeName = agent.name.replace(/[^\w.-]+/g, "_");
	const promptPath = path.join(tmpDir, `prompt-${safeName}.md`);
	let aborted = false;
	let killChild: (() => void) | null = null;

	try {
		await fs.promises.writeFile(promptPath, agent.systemPrompt, { encoding: "utf-8", mode: 0o600 });
		args.push("--append-system-prompt", promptPath);
		args.push(`Task: ${task}`);

		let finalText = "";
		let stopReason: string | undefined;
		let errorMessage: string | undefined;
		let stderr = "";
		let malformedEvent = false;
		let streamTooLarge = false;

		const handleAssistant = (message: any) => {
			const text = extractAssistantText(message);
			if (text) finalText = text;
			if (message?.stopReason) stopReason = message.stopReason;
			if (message?.errorMessage) errorMessage = message.errorMessage;
			options.onOutput?.(finalText || "(running…)");
		};

		const exitCode = await new Promise<number>((resolve) => {
			const invocation = getPiInvocation(args);
			const child = spawn(invocation.command, invocation.args, {
				cwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env, PI_FLOW_CHILD_ROLE: options.role },
			});

			let buffer = "";
			const handleLine = (line: string) => {
				if (!line.trim()) return;
				let event: any;
				try {
					event = JSON.parse(line);
				} catch {
					malformedEvent = true;
					return;
				}
				if (event?.type === "message_end" && event.message?.role === "assistant") {
					handleAssistant(event.message);
				}
			};

			child.stdout.on("data", (chunk) => {
				if (buffer.length + chunk.length > MAX_CHILD_STREAM_BYTES) {
					streamTooLarge = true;
					child.kill("SIGTERM");
					return;
				}
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) handleLine(line);
			});
			child.stderr.on("data", (chunk) => {
				stderr = (stderr + chunk.toString()).slice(-4000);
			});
			child.on("error", () => resolve(1));
			child.on("close", (code) => {
				if (buffer.trim()) handleLine(buffer);
				resolve(code ?? 0);
			});

			if (signal) {
				killChild = () => {
					aborted = true;
					child.kill("SIGTERM");
					setTimeout(() => {
						if (!child.killed) child.kill("SIGKILL");
					}, 5000);
				};
				if (signal.aborted) killChild();
				else signal.addEventListener("abort", killChild, { once: true });
			}
		});

		if (aborted) throw new Error(`flow_agent (${agent.name}) was aborted.`);
		if (streamTooLarge) throw new Error(`flow_agent (${agent.name}) exceeded the bounded output limit.`);
		if (malformedEvent) throw new Error(`flow_agent (${agent.name}) returned malformed JSON output.`);
		if (exitCode !== 0) {
			const detail = stderr.trim().slice(0, 400);
			throw new Error(`flow_agent (${agent.name}) exited with code ${exitCode}.${detail ? ` ${detail}` : ""}`);
		}
		if (stopReason === "error") {
			throw new Error(`flow_agent (${agent.name}) failed: ${errorMessage || "provider error"}.`);
		}
		if (!finalText.trim()) {
			throw new Error(`flow_agent (${agent.name}) returned no final output.`);
		}
		return truncateToByteLimit(finalText);
	} finally {
		if (killChild && signal) signal.removeEventListener("abort", killChild);
		try {
			await fs.promises.unlink(promptPath);
		} catch {
			/* ignore */
		}
		try {
			await fs.promises.rmdir(tmpDir);
		} catch {
			/* ignore */
		}
	}
}
