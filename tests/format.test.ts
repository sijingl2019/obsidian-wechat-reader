import { describe, expect, it } from "vitest";
import {
	formatExcerpt,
	formatFrontmatter,
	formatHighlights,
	sanitizeFileName,
} from "../src/notes/format";

describe("sanitizeFileName", () => {
	it("removes characters Obsidian cannot use in file names", () => {
		expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("a b c d e f g h i j k l m n");
	});
	it("collapses whitespace and trims", () => {
		expect(sanitizeFileName("  三体 :  黑暗森林 ")).toBe("三体 黑暗森林");
	});
	it("falls back for empty names", () => {
		expect(sanitizeFileName("///")).toBe("Untitled");
	});
});

describe("formatFrontmatter", () => {
	it("renders book metadata as YAML frontmatter", () => {
		const fm = formatFrontmatter({
			bookId: "123",
			title: 'He said "hi"',
			author: "刘慈欣",
			cover: "https://x/c.jpg",
		});
		expect(fm).toBe(
			[
				"---",
				'weread-bookId: "123"',
				'title: "He said \\"hi\\""',
				'author: "刘慈欣"',
				'cover: "https://x/c.jpg"',
				"tags: [weread]",
				"---",
				"",
			].join("\n"),
		);
	});
	it("omits missing optional fields", () => {
		expect(formatFrontmatter({ bookId: "1", title: "T" })).not.toContain("author");
	});
});

describe("formatHighlights", () => {
	const chapters = [
		{ chapterUid: 2, chapterIdx: 2, title: "第二章" },
		{ chapterUid: 1, chapterIdx: 1, title: "第一章" },
	];

	it("groups highlights and thoughts by chapter in reading order", () => {
		const md = formatHighlights({
			chapters,
			bookmarks: [
				{ chapterUid: 2, range: "10-20", markText: "二章划线" },
				{ chapterUid: 1, range: "50-60", markText: "一章后段" },
				{ chapterUid: 1, range: "5-9", markText: "一章前段" },
			],
			reviews: [{ chapterUid: 1, range: "5-9", abstract: "一章前段", content: "我的想法" }],
		});
		expect(md).toBe(
			[
				"### 第一章",
				"",
				"> 一章前段",
				"",
				"💭 我的想法",
				"",
				"> 一章后段",
				"",
				"### 第二章",
				"",
				"> 二章划线",
				"",
			].join("\n"),
		);
	});

	it("renders thoughts whose highlight was not saved as their own quote", () => {
		const md = formatHighlights({
			chapters,
			bookmarks: [],
			reviews: [{ chapterUid: 1, range: "1-2", abstract: "原文", content: "想法" }],
		});
		expect(md).toContain("> 原文\n\n💭 想法");
	});

	it("puts book-level reviews (no chapter) under 书评", () => {
		const md = formatHighlights({ chapters, bookmarks: [], reviews: [{ content: "好书" }] });
		expect(md).toBe("### 书评\n\n💭 好书\n");
	});

	it("keeps multi-line marks inside the quote", () => {
		const md = formatHighlights({
			chapters,
			bookmarks: [{ chapterUid: 1, range: "1-2", markText: "a\nb" }],
			reviews: [],
		});
		expect(md).toContain("> a\n> b");
	});

	it("says so when there is nothing", () => {
		expect(formatHighlights({ chapters, bookmarks: [], reviews: [] })).toBe("_暂无划线或想法_\n");
	});
});

describe("formatExcerpt", () => {
	it("renders a quote callout with chapter and time", () => {
		const md = formatExcerpt({ text: "line1\nline2", chapter: "第一章" }, new Date(2026, 9, 1, 8, 5));
		expect(md).toBe("> [!quote] 第一章 · 2026-10-01 08:05\n> line1\n> line2\n");
	});
	it("omits chapter when unknown", () => {
		const md = formatExcerpt({ text: "x" }, new Date(2026, 0, 2, 3, 4));
		expect(md).toBe("> [!quote] 2026-01-02 03:04\n> x\n");
	});
});
