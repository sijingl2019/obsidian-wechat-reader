import { App, TFile, normalizePath } from "obsidian";
import type { BookMeta } from "../weread/types";
import { sanitizeFileName } from "./format";
import { appendExcerpt, initialNote, replaceManagedBlock } from "./noteContent";

/** Finds, creates and updates the one note per book inside the configured folder. */
export class BookNotes {
	constructor(
		private readonly app: App,
		private readonly folder: () => string,
	) {}

	find(book: BookMeta): TFile | null {
		const folder = normalizePath(this.folder());
		const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(`${folder}/`));
		if (book.bookId) {
			const byId = files.find(
				(f) => String(this.app.metadataCache.getFileCache(f)?.frontmatter?.["weread-bookId"] ?? "") === book.bookId,
			);
			if (byId) return byId;
		}
		const file = this.app.vault.getAbstractFileByPath(this.pathFor(book.title));
		return file instanceof TFile ? file : null;
	}

	async ensure(book: BookMeta): Promise<TFile> {
		const existing = this.find(book);
		if (existing) return existing;

		const folder = normalizePath(this.folder());
		if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);

		let path = this.pathFor(book.title);
		for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
			path = this.pathFor(`${book.title} ${i}`);
		}
		return this.app.vault.create(path, initialNote(book));
	}

	async replaceHighlights(file: TFile, block: string): Promise<void> {
		await this.app.vault.process(file, (content) => replaceManagedBlock(content, block));
	}

	async addExcerpt(file: TFile, excerpt: string): Promise<void> {
		await this.app.vault.process(file, (content) => appendExcerpt(content, excerpt));
	}

	private pathFor(title: string): string {
		return normalizePath(`${this.folder()}/${sanitizeFileName(title)}.md`);
	}
}
