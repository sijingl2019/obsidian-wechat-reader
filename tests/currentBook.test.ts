import { describe, expect, it } from "vitest";
import { isReaderUrl, parseCurrentBook } from "../src/weread/currentBook";

describe("isReaderUrl", () => {
	it("matches reader pages only", () => {
		expect(isReaderUrl("https://weread.qq.com/web/reader/ce032b305a9bc1ce0b0dd2a")).toBe(true);
		expect(isReaderUrl("https://weread.qq.com/web/shelf")).toBe(false);
		expect(isReaderUrl("https://evil.com/web/reader/x")).toBe(false);
	});
});

describe("parseCurrentBook", () => {
	it("prefers live store state", () => {
		expect(
			parseCurrentBook({
				reader: {
					bookId: 123,
					bookInfo: { bookId: "123", title: "三体", author: "刘慈欣", cover: "c" },
					currentChapter: { title: "第一章" },
				},
			}),
		).toEqual({ book: { bookId: "123", title: "三体", author: "刘慈欣", cover: "c" }, chapter: "第一章" });
	});
	it("falls back to the DOM title", () => {
		expect(parseCurrentBook({ reader: { bookId: "9" }, domTitle: " 活着 ", domChapter: "一" })).toEqual({
			book: { bookId: "9", title: "活着" },
			chapter: "一",
		});
	});
	it("distrusts stale state when the visible title differs", () => {
		expect(
			parseCurrentBook({ reader: { bookId: "1", bookInfo: { bookId: "1", title: "旧书" } }, domTitle: "新书" }),
		).toEqual({ book: { bookId: "", title: "新书" } });
	});
	it("returns null without a title", () => {
		expect(parseCurrentBook({ reader: { bookId: "9" } })).toBeNull();
		expect(parseCurrentBook(null)).toBeNull();
	});
});
