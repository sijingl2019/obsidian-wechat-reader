import { describe, expect, it } from "vitest";
import { WereadApi, WereadError, buildFetchScript, type Fetcher } from "../src/weread/api";

function fakeFetcher(routes: Record<string, unknown>) {
	const calls: { path: string; body?: unknown }[] = [];
	const fetcher: Fetcher = async (path, body) => {
		calls.push({ path, body });
		const key = Object.keys(routes).find((k) => path.startsWith(k));
		if (!key) throw new Error(`unexpected ${path}`);
		return routes[key];
	};
	return { fetcher, calls };
}

describe("buildFetchScript", () => {
	it("builds a same-origin GET with credentials", () => {
		const js = buildFetchScript("/web/book/info?bookId=1");
		expect(js).toContain('fetch("/web/book/info?bookId=1"');
		expect(js).toContain('credentials: "include"');
		expect(js).not.toContain("POST");
	});
	it("turns non-JSON responses into errcodes", async () => {
		const run = (status: number, text: string) =>
			new Function("fetch", `return ${buildFetchScript("/x")}`)(async () => ({ status, text: async () => text }));
		expect(await run(200, '{"a":1}')).toEqual({ a: 1 });
		expect(await run(401, "nope")).toEqual({ errcode: -2012, errmsg: "HTTP 401" });
		expect(await run(404, "<html>")).toEqual({ errcode: -404, errmsg: "HTTP 404" });
	});
	it("builds a JSON POST when a body is given", () => {
		const js = buildFetchScript("/x", { a: 1 });
		expect(js).toContain('method: "POST"');
		expect(js).toContain(JSON.stringify(JSON.stringify({ a: 1 })));
	});
});

describe("WereadApi", () => {
	it("maps book info", async () => {
		const { fetcher, calls } = fakeFetcher({
			"/web/book/info": { bookId: "42", title: "三体", author: "刘慈欣", cover: "c.jpg", intro: "..." },
		});
		const book = await new WereadApi(fetcher).getBookInfo("42");
		expect(calls[0].path).toBe("/web/book/info?bookId=42");
		expect(book).toEqual({ bookId: "42", title: "三体", author: "刘慈欣", cover: "c.jpg" });
	});

	it("maps bookmarks", async () => {
		const { fetcher } = fakeFetcher({
			"/web/book/bookmarklist": {
				updated: [{ chapterUid: 3, range: "1-5", markText: "hi", bookmarkId: "x", createTime: 1 }],
				chapters: [],
			},
		});
		expect(await new WereadApi(fetcher).getBookmarks("42")).toEqual([
			{ chapterUid: 3, range: "1-5", markText: "hi" },
		]);
	});

	it("maps chapter thoughts and book reviews", async () => {
		const { fetcher, calls } = fakeFetcher({
			"/web/review/list": {
				reviews: [
					{ review: { type: 1, chapterUid: 3, range: "1-5", abstract: "hi", content: "想法" } },
					{ review: { type: 4, content: "书评" } },
				],
			},
		});
		const reviews = await new WereadApi(fetcher).getReviews("42");
		expect(calls[0].path).toBe("/web/review/list?bookId=42&listType=11&mine=1&synckey=0");
		expect(reviews).toEqual([
			{ chapterUid: 3, range: "1-5", abstract: "hi", content: "想法" },
			{ content: "书评" },
		]);
	});

	it("posts for chapter infos", async () => {
		const { fetcher, calls } = fakeFetcher({
			"/web/book/chapterInfos": {
				data: [{ bookId: "42", updated: [{ chapterUid: 3, chapterIdx: 1, title: "序", level: 1 }] }],
			},
		});
		expect(await new WereadApi(fetcher).getChapters("42")).toEqual([{ chapterUid: 3, chapterIdx: 1, title: "序" }]);
		expect(calls[0]).toEqual({ path: "/web/book/chapterInfos", body: { bookIds: ["42"] } });
	});

	it("throws a login error on errcode -2012", async () => {
		const { fetcher } = fakeFetcher({ "/web/book/info": { errcode: -2012, errmsg: "登录超时" } });
		const err = await new WereadApi(fetcher).getBookInfo("1").catch((e) => e);
		expect(err).toBeInstanceOf(WereadError);
		expect(err.isLoginError).toBe(true);
	});

	it("does not treat other errcodes as login errors", async () => {
		const { fetcher } = fakeFetcher({ "/web/book/info": { errCode: -1, errMsg: "boom" } });
		const err = await new WereadApi(fetcher).getBookInfo("1").catch((e) => e);
		expect(err).toBeInstanceOf(WereadError);
		expect(err.isLoginError).toBe(false);
		expect(err.message).toContain("boom");
	});

	it("collects highlights for a book", async () => {
		const { fetcher } = fakeFetcher({
			"/web/book/bookmarklist": { updated: [{ chapterUid: 3, range: "1-5", markText: "hi" }] },
			"/web/review/list": { reviews: [] },
			"/web/book/chapterInfos": { data: [{ updated: [{ chapterUid: 3, chapterIdx: 1, title: "序" }] }] },
		});
		const data = await new WereadApi(fetcher).getHighlights("42");
		expect(data.bookmarks).toHaveLength(1);
		expect(data.chapters[0].title).toBe("序");
	});

	it("reports login state", async () => {
		expect(await new WereadApi(fakeFetcher({ "/web/shelf/sync": { books: [] } }).fetcher).isLoggedIn()).toBe(true);
		expect(await new WereadApi(fakeFetcher({ "/web/shelf/sync": { errcode: -2012 } }).fetcher).isLoggedIn()).toBe(false);
		await expect(
			new WereadApi(fakeFetcher({ "/web/shelf/sync": { errcode: -1 } }).fetcher).isLoggedIn(),
		).rejects.toBeInstanceOf(WereadError);
	});
});
