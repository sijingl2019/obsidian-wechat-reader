import type { BookMeta } from "./types";

export const WEREAD_ORIGIN = "https://weread.qq.com";

export function isReaderUrl(url: string): boolean {
	return url.startsWith(`${WEREAD_ORIGIN}/web/reader/`);
}

/**
 * Runs inside the WeRead page. Reads the live Vuex store when available, falling
 * back to the server-rendered __INITIAL_STATE__; the DOM gives the visible title and chapter.
 */
export const CURRENT_BOOK_SCRIPT = `(() => {
	const app = document.querySelector("#app");
	const store = app && app.__vue__ && app.__vue__.$store;
	const state = (store && store.state) || window.__INITIAL_STATE__ || {};
	const text = (sel) => { const el = document.querySelector(sel); return el ? el.textContent : undefined; };
	const reader = state.reader || {};
	return {
		reader: {
			bookId: reader.bookId,
			bookInfo: reader.bookInfo && { bookId: reader.bookInfo.bookId, title: reader.bookInfo.title, author: reader.bookInfo.author, cover: reader.bookInfo.cover },
			currentChapter: reader.currentChapter && { title: reader.currentChapter.title },
		},
		domTitle: text(".readerTopBar_title_link"),
		domChapter: text(".renderTargetPageInfo_header_chapterTitle") || text(".readerTopBar_title_chapter"),
	};
})()`;

export interface RawState {
	reader?: {
		bookId?: string | number;
		bookInfo?: { bookId?: string | number; title?: string; author?: string; cover?: string };
		currentChapter?: { title?: string };
	};
	domTitle?: string;
	domChapter?: string;
}

export function parseCurrentBook(raw: RawState | null | undefined): { book: BookMeta; chapter?: string } | null {
	const reader = raw?.reader ?? {};
	let info = reader.bookInfo ?? {};
	let bookId = String(info.bookId ?? reader.bookId ?? "");
	const domTitle = raw?.domTitle?.trim();
	// __INITIAL_STATE__ is only rendered on full page loads; if the page has since moved
	// to another book, the visible title wins and the stale id is dropped.
	if (domTitle && info.title && domTitle !== info.title.trim()) {
		info = {};
		bookId = "";
	}
	const title = (info.title ?? domTitle ?? "").trim();
	if (!title) return null;

	const book: BookMeta = { bookId, title };
	if (info.author) book.author = info.author;
	if (info.cover) book.cover = info.cover;
	const chapter = (reader.currentChapter?.title ?? raw?.domChapter)?.trim();
	return chapter ? { book, chapter } : { book };
}
