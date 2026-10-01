import type { BookMeta, Bookmark, Chapter, Excerpt, Review } from "../weread/types";

export function sanitizeFileName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned || "Untitled";
}

function yamlString(value: string): string {
	return JSON.stringify(value);
}

export function formatFrontmatter(book: BookMeta): string {
	const lines = ["---", `weread-bookId: ${yamlString(book.bookId)}`, `title: ${yamlString(book.title)}`];
	if (book.author) lines.push(`author: ${yamlString(book.author)}`);
	if (book.cover) lines.push(`cover: ${yamlString(book.cover)}`);
	lines.push("tags: [weread]", "---", "");
	return lines.join("\n");
}

function quote(text: string): string {
	return text
		.trim()
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

function rangeStart(range?: string): number {
	const start = parseInt((range ?? "").split("-")[0], 10);
	return Number.isNaN(start) ? 0 : start;
}

interface Entry {
	range: string;
	text: string;
	thoughts: string[];
}

export function formatHighlights(input: {
	chapters: Chapter[];
	bookmarks: Bookmark[];
	reviews: Review[];
}): string {
	const byChapter = new Map<number, Map<string, Entry>>();
	const entriesOf = (uid: number) => {
		let entries = byChapter.get(uid);
		if (!entries) byChapter.set(uid, (entries = new Map<string, Entry>()));
		return entries;
	};

	for (const mark of input.bookmarks) {
		entriesOf(mark.chapterUid).set(mark.range, { range: mark.range, text: mark.markText, thoughts: [] });
	}

	const bookReviews: string[] = [];
	for (const review of input.reviews) {
		if (review.chapterUid === undefined) {
			bookReviews.push(review.content);
			continue;
		}
		const range = review.range ?? "";
		const entries = entriesOf(review.chapterUid);
		const entry = entries.get(range) ?? { range, text: review.abstract ?? "", thoughts: [] };
		entry.thoughts.push(review.content);
		entries.set(range, entry);
	}

	const chapterOrder = new Map(input.chapters.map((c) => [c.chapterUid, c]));
	const uids = [...byChapter.keys()].sort(
		(a, b) => (chapterOrder.get(a)?.chapterIdx ?? a) - (chapterOrder.get(b)?.chapterIdx ?? b),
	);

	const out: string[] = [];
	for (const uid of uids) {
		out.push(`### ${chapterOrder.get(uid)?.title ?? `章节 ${uid}`}`, "");
		const entries = [...byChapter.get(uid)!.values()].sort((a, b) => rangeStart(a.range) - rangeStart(b.range));
		for (const entry of entries) {
			if (entry.text) out.push(quote(entry.text), "");
			for (const thought of entry.thoughts) out.push(`💭 ${thought.trim()}`, "");
		}
	}
	if (bookReviews.length) {
		out.push("### 书评", "");
		for (const review of bookReviews) out.push(`💭 ${review.trim()}`, "");
	}

	if (!out.length) return "_暂无划线或想法_\n";
	return out.join("\n").replace(/\n+$/, "\n");
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

export function formatTimestamp(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatExcerpt(excerpt: Excerpt, now: Date): string {
	const title = [excerpt.chapter, formatTimestamp(now)].filter(Boolean).join(" · ");
	return `> [!quote] ${title}\n${quote(excerpt.text)}\n`;
}
