import type { BookMeta } from "../weread/types";
import { formatFrontmatter } from "./format";

export const HIGHLIGHTS_START = "<!-- weread:highlights:start -->";
export const HIGHLIGHTS_END = "<!-- weread:highlights:end -->";
const EXCERPT_HEADING = "## 摘录";

export function initialNote(book: BookMeta): string {
	return [
		formatFrontmatter(book),
		`# ${book.title}`,
		"",
		"## 我的笔记",
		"",
		"",
		"## 划线与想法",
		"",
		HIGHLIGHTS_START,
		"_尚未同步，点击阅读器工具栏的「同步划线」_",
		HIGHLIGHTS_END,
		"",
		EXCERPT_HEADING,
		"",
	].join("\n");
}

/** Replaces the plugin-managed highlights block, leaving everything the user wrote untouched. */
export function replaceManagedBlock(content: string, block: string): string {
	const start = content.indexOf(HIGHLIGHTS_START);
	const end = content.indexOf(HIGHLIGHTS_END, start);
	const body = `${HIGHLIGHTS_START}\n${block}${HIGHLIGHTS_END}`;
	if (start === -1 || end === -1) {
		return `${content.replace(/\n*$/, "")}\n\n## 划线与想法\n\n${body}\n`;
	}
	return content.slice(0, start) + body + content.slice(end + HIGHLIGHTS_END.length);
}

export function appendExcerpt(content: string, excerpt: string): string {
	let base = content.replace(/\n*$/, "");
	if (!base.split("\n").includes(EXCERPT_HEADING)) base += `\n\n${EXCERPT_HEADING}`;
	return `${base}\n\n${excerpt}`;
}
