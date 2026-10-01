import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type WechatReaderPlugin from "./main";

export interface WechatReaderSettings {
	noteFolder: string;
	autoOpenNote: boolean;
	autoExcerptOnCopy: boolean;
}

export const DEFAULT_SETTINGS: WechatReaderSettings = {
	noteFolder: "WeChat Reader",
	autoOpenNote: true,
	autoExcerptOnCopy: true,
};

export class WechatReaderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: WechatReaderPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("笔记文件夹")
			.setDesc("每本书的笔记保存在这个文件夹下。")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.noteFolder)
					.setValue(this.plugin.settings.noteFolder)
					.onChange(async (value) => {
						this.plugin.settings.noteFolder = value.trim() || DEFAULT_SETTINGS.noteFolder;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("打开书时自动打开笔记")
			.setDesc("在阅读器右侧分屏打开这本书的笔记，没有则自动创建。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoOpenNote).onChange(async (value) => {
					this.plugin.settings.autoOpenNote = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("复制即摘录")
			.setDesc("在阅读器中选中文字并点击微信读书的「复制」时，自动把文字追加到这本书笔记的「摘录」部分。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoExcerptOnCopy).onChange(async (value) => {
					this.plugin.settings.autoExcerptOnCopy = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("退出登录")
			.setDesc("清除插件内保存的微信读书登录状态。")
			.addButton((button) =>
				button
					.setButtonText("退出登录")
					.setWarning()
					.onClick(async () => {
						await this.plugin.logout();
						new Notice("已退出微信读书登录");
					}),
			);
	}
}
