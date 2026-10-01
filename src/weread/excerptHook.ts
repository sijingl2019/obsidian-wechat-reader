export const EXCERPT_PREFIX = "__WECHAT_READER_EXCERPT__";

/**
 * Injected into the WeRead page. WeRead renders text on canvas, so the only reliable
 * way to get selected text is to observe what its own "复制" button puts on the clipboard.
 * Each copy is reported to the host through a tagged console message.
 */
export const EXCERPT_HOOK_SCRIPT = `
(function () {
	if (window.__wechatReaderHooked) return;
	window.__wechatReaderHooked = true;
	var last = { text: "", at: 0 };
	function report(text) {
		if (typeof text !== "string" || !text.trim()) return;
		var now = Date.now();
		if (text === last.text && now - last.at < 1000) return;
		last = { text: text, at: now };
		console.log(${JSON.stringify(EXCERPT_PREFIX)} + JSON.stringify({ text: text }));
	}
	var clip = navigator.clipboard;
	if (clip && clip.writeText) {
		var writeText = clip.writeText.bind(clip);
		clip.writeText = function (text) { report(text); return writeText(text); };
	}
	var execCommand = document.execCommand.bind(document);
	document.execCommand = function (cmd) {
		if (String(cmd).toLowerCase() === "copy") {
			var el = document.activeElement;
			if (el && typeof el.value === "string" && typeof el.selectionStart === "number") {
				report(el.value.slice(el.selectionStart, el.selectionEnd));
			} else if (document.getSelection && document.getSelection()) {
				report(String(document.getSelection()));
			}
		}
		return execCommand.apply(null, arguments);
	};
	if (typeof DataTransfer !== "undefined") {
		var setData = DataTransfer.prototype.setData;
		DataTransfer.prototype.setData = function (type, data) {
			if (/^text(\\/plain)?$/i.test(type)) report(data);
			return setData.apply(this, arguments);
		};
	}
})();
`;

export function parseExcerptMessage(message: string): string | null {
	if (!message.startsWith(EXCERPT_PREFIX)) return null;
	try {
		const text = JSON.parse(message.slice(EXCERPT_PREFIX.length)).text;
		return typeof text === "string" && text.trim() ? text.trim() : null;
	} catch {
		return null;
	}
}
