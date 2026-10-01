import { describe, expect, it } from "vitest";
import { HIGHLIGHTS_END, HIGHLIGHTS_START, appendExcerpt, initialNote, replaceManagedBlock } from "../src/notes/noteContent";

describe("initialNote", () => {
	it("has frontmatter, title, a notes section, an empty managed block and an excerpt section", () => {
		const note = initialNote({ bookId: "1", title: "三体" });
		expect(note.startsWith("---\nweread-bookId: \"1\"")).toBe(true);
		expect(note).toContain("# 三体\n");
		expect(note).toContain("## 我的笔记");
		expect(note).toContain(`${HIGHLIGHTS_START}\n_尚未同步，点击阅读器工具栏的「同步划线」_\n${HIGHLIGHTS_END}`);
		expect(note.trimEnd().endsWith("## 摘录")).toBe(true);
	});
});

describe("replaceManagedBlock", () => {
	it("replaces only the content between markers", () => {
		const before = `mine\n${HIGHLIGHTS_START}\nold\n${HIGHLIGHTS_END}\nmore mine\n`;
		expect(replaceManagedBlock(before, "new\n")).toBe(`mine\n${HIGHLIGHTS_START}\nnew\n${HIGHLIGHTS_END}\nmore mine\n`);
	});
	it("appends a section when markers are missing", () => {
		expect(replaceManagedBlock("mine\n", "new\n")).toBe(
			`mine\n\n## 划线与想法\n\n${HIGHLIGHTS_START}\nnew\n${HIGHLIGHTS_END}\n`,
		);
	});
	it("is safe with $ in replacement text", () => {
		const before = `${HIGHLIGHTS_START}\n${HIGHLIGHTS_END}`;
		expect(replaceManagedBlock(before, "cost $1 $&\n")).toContain("cost $1 $&");
	});
});

describe("appendExcerpt", () => {
	it("appends at the end when the excerpt section exists", () => {
		expect(appendExcerpt("a\n\n## 摘录\n", "> q\n")).toBe("a\n\n## 摘录\n\n> q\n");
	});
	it("separates consecutive excerpts", () => {
		expect(appendExcerpt("## 摘录\n\n> q1\n", "> q2\n")).toBe("## 摘录\n\n> q1\n\n> q2\n");
	});
	it("creates the excerpt section when missing", () => {
		expect(appendExcerpt("a", "> q\n")).toBe("a\n\n## 摘录\n\n> q\n");
	});
});
