import { describe, expect, it } from "vitest";
import { EXCERPT_HOOK_SCRIPT, EXCERPT_PREFIX, parseExcerptMessage } from "../src/weread/excerptHook";

describe("parseExcerptMessage", () => {
	it("extracts text from tagged console messages", () => {
		expect(parseExcerptMessage(EXCERPT_PREFIX + JSON.stringify({ text: " 你好 " }))).toBe("你好");
	});
	it("ignores other messages and garbage", () => {
		expect(parseExcerptMessage("hello")).toBeNull();
		expect(parseExcerptMessage(EXCERPT_PREFIX + "{bad")).toBeNull();
		expect(parseExcerptMessage(EXCERPT_PREFIX + JSON.stringify({ text: "  " }))).toBeNull();
	});
});

describe("EXCERPT_HOOK_SCRIPT", () => {
	it("is valid JavaScript", () => {
		expect(() => new Function(EXCERPT_HOOK_SCRIPT)).not.toThrow();
	});
	it("reports clipboard writes through console.log", async () => {
		const logs: string[] = [];
		const writes: string[] = [];
		const win: any = {
			navigator: { clipboard: { writeText: async (t: string) => void writes.push(t) } },
			console: { log: (m: string) => logs.push(m) },
		};
		const doc: any = { execCommand: () => true, addEventListener: () => {}, getSelection: () => null };
		win.DataTransfer = function () {};
		win.DataTransfer.prototype.setData = () => {};
		new Function("window", "document", "navigator", "console", "DataTransfer", EXCERPT_HOOK_SCRIPT)(
			win, doc, win.navigator, win.console, win.DataTransfer,
		);
		await win.navigator.clipboard.writeText("摘录文字");
		expect(writes).toEqual(["摘录文字"]);
		expect(logs.map(parseExcerptMessage)).toEqual(["摘录文字"]);
	});
});
