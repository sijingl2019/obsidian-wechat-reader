import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type WechatReaderPlugin from "./main";
import { WereadApi, buildFetchScript } from "./weread/api";
import { CURRENT_BOOK_SCRIPT, WEREAD_ORIGIN, isReaderUrl, parseCurrentBook, type RawState } from "./weread/currentBook";
import { EXCERPT_HOOK_SCRIPT, parseExcerptMessage } from "./weread/excerptHook";
import type { BookMeta } from "./weread/types";

export const VIEW_TYPE_WECHAT_READER = "wechat-reader-view";
export const WEBVIEW_PARTITION = "persist:wechat-reader";
const HOME_URL = `${WEREAD_ORIGIN}/web/shelf`;
// WeRead serves a degraded page to unknown Electron user agents.
const USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** The subset of Electron's WebviewTag this view uses. */
interface WebviewElement extends HTMLElement {
	src: string;
	getURL(): string;
	canGoBack(): boolean;
	canGoForward(): boolean;
	goBack(): void;
	goForward(): void;
	reload(): void;
	loadURL(url: string): Promise<void>;
	executeJavaScript(code: string): Promise<unknown>;
}

export class ReaderView extends ItemView {
	private webview!: WebviewElement;
	private statusEl!: HTMLElement;
	private bookEl!: HTMLElement;
	private ready = false;
	private loggedIn = false;
	private lookupToken = 0;
	currentBook: BookMeta | null = null;
	readonly api = new WereadApi((path, body) => this.runInPage(buildFetchScript(path, body)));

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: WechatReaderPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_WECHAT_READER;
	}

	getDisplayText(): string {
		return this.currentBook ? `微信读书 · ${this.currentBook.title}` : "微信读书";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("wechat-reader-view");

		const toolbar = root.createDiv({ cls: "wechat-reader-toolbar" });
		this.toolbarButton(toolbar, "arrow-left", "后退", () => this.webview.canGoBack() && this.webview.goBack());
		this.toolbarButton(toolbar, "arrow-right", "前进", () => this.webview.canGoForward() && this.webview.goForward());
		this.toolbarButton(toolbar, "rotate-cw", "刷新", () => this.webview.reload());
		this.toolbarButton(toolbar, "library", "书架", () => this.webview.loadURL(HOME_URL));
		this.bookEl = toolbar.createSpan({ cls: "wechat-reader-book" });
		toolbar.createDiv({ cls: "wechat-reader-spacer" });
		this.statusEl = toolbar.createSpan({ cls: "wechat-reader-status" });
		this.toolbarButton(toolbar, "file-text", "打开本书笔记", () => this.plugin.openBookNote());
		this.toolbarButton(toolbar, "refresh-ccw", "同步划线与想法", () => this.plugin.syncHighlights());

		const webview = root.createEl("webview" as keyof HTMLElementTagNameMap, {
			cls: "wechat-reader-webview",
			attr: { partition: WEBVIEW_PARTITION, useragent: USER_AGENT, src: HOME_URL },
		}) as unknown as WebviewElement;
		this.webview = webview;

		webview.addEventListener("dom-ready", () => {
			this.ready = true;
			void this.runInPage(EXCERPT_HOOK_SCRIPT).catch((e) => console.error("[wechat-reader] hook", e));
			void this.refreshLoginStatus();
			void this.detectBook();
		});
		webview.addEventListener("did-navigate", () => void this.detectBook());
		webview.addEventListener("did-navigate-in-page", () => void this.detectBook());
		webview.addEventListener("console-message", (event: Event) => {
			const text = parseExcerptMessage((event as Event & { message: string }).message ?? "");
			if (text) void this.plugin.handleCopiedText(text);
		});
		this.setStatus("加载中…");
		// Pick up a QR-code login without requiring a page reload.
		this.registerInterval(
			window.setInterval(() => {
				if (this.ready && !this.loggedIn) void this.refreshLoginStatus();
			}, 4000),
		);
	}

	async onClose(): Promise<void> {
		this.ready = false;
	}

	async runInPage(code: string): Promise<unknown> {
		if (!this.ready || !this.webview.getURL().startsWith(WEREAD_ORIGIN)) {
			throw new Error("微信读书页面尚未加载");
		}
		return this.webview.executeJavaScript(code);
	}

	/** Re-reads the current chapter title; the book itself is tracked on navigation. */
	async currentChapter(): Promise<string | undefined> {
		try {
			return parseCurrentBook((await this.runInPage(CURRENT_BOOK_SCRIPT)) as RawState)?.chapter;
		} catch {
			return undefined;
		}
	}

	async reload(): Promise<void> {
		await this.webview.loadURL(HOME_URL);
	}

	private async detectBook(): Promise<void> {
		const token = ++this.lookupToken;
		if (!this.ready || !isReaderUrl(this.webview.getURL())) {
			this.setBook(null);
			return;
		}
		// The reader is a SPA; its state may land a little after navigation.
		for (let attempt = 0; attempt < 20 && token === this.lookupToken; attempt++) {
			try {
				const parsed = parseCurrentBook((await this.runInPage(CURRENT_BOOK_SCRIPT)) as RawState);
				if (parsed && token === this.lookupToken) {
					const changed = parsed.book.bookId !== this.currentBook?.bookId || parsed.book.title !== this.currentBook?.title;
					this.setBook(parsed.book);
					if (changed) await this.plugin.onBookOpened(parsed.book);
					return;
				}
			} catch (e) {
				console.debug("[wechat-reader] book lookup", e);
			}
			await sleep(500);
		}
	}

	private setBook(book: BookMeta | null): void {
		this.currentBook = book;
		this.bookEl.setText(book ? `《${book.title}》` : "");
		(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
	}

	async refreshLoginStatus(): Promise<boolean> {
		try {
			const loggedIn = await this.api.isLoggedIn();
			this.loggedIn = loggedIn;
			this.setStatus(loggedIn ? "已登录" : "未登录，请在页面中扫码登录", loggedIn);
			return loggedIn;
		} catch (e) {
			this.setStatus("登录状态未知");
			console.debug("[wechat-reader] login probe", e);
			return false;
		}
	}

	private setStatus(text: string, ok = false): void {
		this.statusEl.setText(text);
		this.statusEl.toggleClass("is-ok", ok);
	}

	private toolbarButton(parent: HTMLElement, icon: string, label: string, onClick: () => unknown): void {
		const button = parent.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
		setIcon(button, icon);
		button.addEventListener("click", () => void onClick());
	}
}
