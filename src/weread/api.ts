import type { BookMeta, Bookmark, Chapter, Review } from "./types";

/** Performs a same-origin request on weread.qq.com and returns the parsed JSON. */
export type Fetcher = (path: string, body?: unknown) => Promise<unknown>;

const LOGIN_ERROR_CODES = [-2010, -2012, -2013];

export class WereadError extends Error {
	constructor(
		message: string,
		readonly code: number,
	) {
		super(message);
		this.name = "WereadError";
	}

	get isLoginError(): boolean {
		return LOGIN_ERROR_CODES.includes(this.code);
	}
}

/** Script run inside the WeRead page so the request carries the logged-in cookies. */
export function buildFetchScript(path: string, body?: unknown): string {
	const init =
		body === undefined
			? `{ credentials: "include" }`
			: `{ method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(JSON.stringify(body))} }`;
	// Non-JSON answers (404 pages, 401s) become errcodes so callers see one error shape.
	return `fetch(${JSON.stringify(path)}, ${init}).then((r) => r.text().then((t) => {
		try { return JSON.parse(t); } catch (e) { return { errcode: r.status === 401 ? -2012 : -r.status, errmsg: "HTTP " + r.status }; }
	}))`;
}

interface ErrorFields {
	errcode?: number;
	errCode?: number;
	errmsg?: string;
	errMsg?: string;
}

interface RawBookInfo {
	bookId?: string | number;
	title: string;
	author?: string;
	cover?: string;
}

interface RawBookmarkList {
	updated?: Bookmark[];
}

interface RawReview {
	type?: number;
	chapterUid?: number;
	range?: string;
	abstract?: string;
	content: string;
}

interface RawReviewList {
	reviews?: { review: RawReview }[];
}

interface RawChapterInfos {
	data?: { updated?: Chapter[] }[];
}

export class WereadApi {
	constructor(private readonly fetcher: Fetcher) {}

	private async request<T>(path: string, body?: unknown): Promise<T> {
		const res = (await this.fetcher(path, body)) as (T & ErrorFields) | null;
		const code = res?.errcode ?? res?.errCode;
		if (typeof code === "number" && code !== 0) {
			throw new WereadError(`微信读书接口错误 ${code}: ${res?.errmsg ?? res?.errMsg ?? ""}`, code);
		}
		return (res ?? {}) as T;
	}

	/** Probes an endpoint that needs a session; login errors mean "not logged in". */
	async isLoggedIn(): Promise<boolean> {
		try {
			await this.request<unknown>("/web/shelf/sync");
			return true;
		} catch (e) {
			if (e instanceof WereadError && e.isLoginError) return false;
			throw e;
		}
	}

	async getBookInfo(bookId: string): Promise<BookMeta> {
		const res = await this.request<RawBookInfo>(`/web/book/info?bookId=${encodeURIComponent(bookId)}`);
		return { bookId: String(res.bookId ?? bookId), title: res.title, author: res.author, cover: res.cover };
	}

	async getBookmarks(bookId: string): Promise<Bookmark[]> {
		const res = await this.request<RawBookmarkList>(`/web/book/bookmarklist?bookId=${encodeURIComponent(bookId)}`);
		return (res.updated ?? []).map((m) => ({
			chapterUid: m.chapterUid,
			range: m.range,
			markText: m.markText,
		}));
	}

	async getReviews(bookId: string): Promise<Review[]> {
		const res = await this.request<RawReviewList>(
			`/web/review/list?bookId=${encodeURIComponent(bookId)}&listType=11&mine=1&synckey=0`,
		);
		return (res.reviews ?? []).map(({ review: r }) =>
			r.type === 4 || r.chapterUid === undefined
				? { content: r.content }
				: { chapterUid: r.chapterUid, range: r.range, abstract: r.abstract, content: r.content },
		);
	}

	async getChapters(bookId: string): Promise<Chapter[]> {
		const res = await this.request<RawChapterInfos>("/web/book/chapterInfos", { bookIds: [bookId] });
		const updated = res.data?.[0]?.updated ?? [];
		return updated.map((c) => ({ chapterUid: c.chapterUid, chapterIdx: c.chapterIdx, title: c.title }));
	}

	async getHighlights(bookId: string): Promise<{ chapters: Chapter[]; bookmarks: Bookmark[]; reviews: Review[] }> {
		const [chapters, bookmarks, reviews] = await Promise.all([
			this.getChapters(bookId),
			this.getBookmarks(bookId),
			this.getReviews(bookId),
		]);
		return { chapters, bookmarks, reviews };
	}
}
