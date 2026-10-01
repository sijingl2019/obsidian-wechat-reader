export interface BookMeta {
	bookId: string;
	title: string;
	author?: string;
	cover?: string;
}

export interface Chapter {
	chapterUid: number;
	chapterIdx: number;
	title: string;
}

export interface Bookmark {
	chapterUid: number;
	/** "start-end" character offsets inside the chapter */
	range: string;
	markText: string;
}

export interface Review {
	chapterUid?: number;
	range?: string;
	/** quoted original text the thought is attached to */
	abstract?: string;
	content: string;
}

export interface Excerpt {
	text: string;
	chapter?: string;
}
