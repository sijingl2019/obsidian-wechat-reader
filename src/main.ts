import { Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { BookNotes } from "./notes/bookNotes";
import { formatExcerpt, formatHighlights } from "./notes/format";
import { ReaderView, VIEW_TYPE_WECHAT_READER, WEBVIEW_PARTITION } from "./readerView";
import { DEFAULT_SETTINGS, WechatReaderSettingTab, type WechatReaderSettings } from "./settings";
import { WereadError } from "./weread/api";
import type { BookMeta } from "./weread/types";

interface ElectronSession {
	clearStorageData(): Promise<void>;
}

/** The webview's session lives in Electron's main process; reach it through @electron/remote. */
function electronSession(partition: string): ElectronSession | undefined {
	const req = (window as Window & { require?: (id: string) => unknown }).require;
	const electron = req?.("electron") as
		| { remote?: { session?: { fromPartition(p: string): ElectronSession } } }
		| undefined;
	return electron?.remote?.session?.fromPartition(partition);
}

export default class WechatReaderPlugin extends Plugin {
	settings!: WechatReaderSettings;
	private notes!: BookNotes;
	private noteLeaf: WorkspaceLeaf | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		if (!Platform.isDesktopApp) {
			new Notice("本插件仅支持桌面版 Obsidian");
			return;
		}
		this.notes = new BookNotes(this.app, () => this.settings.noteFolder);

		this.registerView(VIEW_TYPE_WECHAT_READER, (leaf) => new ReaderView(leaf, this));
		this.addRibbonIcon("book-open", "打开微信读书", () => void this.activateReader());
		this.addSettingTab(new WechatReaderSettingTab(this.app, this));

		this.addCommand({ id: "open-reader", name: "打开微信读书", callback: () => void this.activateReader() });
		this.addCommand({ id: "open-book-note", name: "打开当前书的笔记", callback: () => void this.openBookNote() });
		this.addCommand({ id: "sync-highlights", name: "同步当前书的划线与想法", callback: () => void this.syncHighlights() });
		this.addCommand({
			id: "insert-clipboard-excerpt",
			name: "把剪贴板内容摘录到当前书笔记",
			callback: async () => {
				const text = (await navigator.clipboard.readText()).trim();
				if (!text) return void new Notice("剪贴板为空");
				await this.addExcerpt(text);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<WechatReaderSettings> | null) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private readerView(): ReaderView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_READER)[0];
		return leaf?.view instanceof ReaderView ? leaf.view : null;
	}

	/** Returns the open reader and the book it shows, or explains what is missing. */
	private currentReading(): { view: ReaderView; book: BookMeta } | null {
		const view = this.readerView();
		if (!view) {
			new Notice("请先打开微信读书阅读器");
			return null;
		}
		if (!view.currentBook) {
			new Notice("请先在阅读器中打开一本书");
			return null;
		}
		return { view, book: view.currentBook };
	}

	async activateReader(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_WECHAT_READER)[0];
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: VIEW_TYPE_WECHAT_READER, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async onBookOpened(book: BookMeta): Promise<void> {
		if (this.settings.autoOpenNote) await this.openBookNote();
	}

	async openBookNote(): Promise<void> {
		const reading = this.currentReading();
		if (!reading) return;
		const file = await this.ensureNote(reading.view, reading.book);
		await this.showNote(reading.view, file);
	}

	async syncHighlights(): Promise<void> {
		const reading = this.currentReading();
		if (!reading) return;
		const { view, book } = reading;
		if (!book.bookId) return void new Notice("无法识别这本书的 ID，暂不能同步");
		try {
			const data = await view.api.getHighlights(book.bookId);
			const file = await this.ensureNote(view, book);
			await this.notes.replaceHighlights(file, formatHighlights(data));
			await this.showNote(view, file);
			new Notice(`已同步《${book.title}》：${data.bookmarks.length} 条划线，${data.reviews.length} 条想法`);
		} catch (e) {
			this.reportError(e, "同步失败");
		}
	}

	async handleCopiedText(text: string): Promise<void> {
		if (this.settings.autoExcerptOnCopy) await this.addExcerpt(text);
	}

	async addExcerpt(text: string): Promise<void> {
		const reading = this.currentReading();
		if (!reading) return;
		const { view, book } = reading;
		try {
			const file = await this.ensureNote(view, book);
			const chapter = await view.currentChapter();
			await this.notes.addExcerpt(file, formatExcerpt({ text, chapter }, new Date()));
			new Notice(`已摘录到《${book.title}》`);
		} catch (e) {
			this.reportError(e, "摘录失败");
		}
	}

	async logout(): Promise<void> {
		try {
			const session = electronSession(WEBVIEW_PARTITION);
			if (!session) throw new Error("无法访问 Electron session");
			await session.clearStorageData();
		} catch (e) {
			this.reportError(e, "退出登录失败");
			return;
		}
		await this.readerView()?.reload();
	}

	private async ensureNote(view: ReaderView, book: BookMeta): Promise<TFile> {
		const existing = this.notes.find(book);
		if (existing) return existing;
		let meta = book;
		if (book.bookId && !book.author) {
			try {
				meta = { ...(await view.api.getBookInfo(book.bookId)), title: book.title };
			} catch (e) {
				console.debug("[wechat-reader] book info", e);
			}
		}
		return this.notes.ensure(meta);
	}

	/** Shows the note in one split next to the reader, reusing it when switching books. */
	private async showNote(view: ReaderView, file: TFile): Promise<void> {
		const { workspace } = this.app;
		let leaf = this.noteLeaf;
		const alive = leaf && workspace.getLeavesOfType("markdown").includes(leaf);
		if (!leaf || !alive) {
			leaf = workspace.createLeafBySplit(view.leaf, "vertical");
			this.noteLeaf = leaf;
		}
		if ((leaf.view as { file?: TFile }).file?.path !== file.path) {
			await leaf.openFile(file, { active: false });
		}
	}

	private reportError(e: unknown, action: string): void {
		console.error("[wechat-reader]", e);
		if (e instanceof WereadError && e.isLoginError) {
			new Notice("微信读书登录已失效，请在阅读器中重新扫码登录");
			void this.readerView()?.refreshLoginStatus();
			return;
		}
		new Notice(`${action}：${e instanceof Error ? e.message : String(e)}`);
	}
}
