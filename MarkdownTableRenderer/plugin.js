(function(exports) {

"use strict";

//#region plugins/MarkdownTableRenderer/index.js
let _inst = null;
function onLoad() {
	_inst = new MarkdownTableRendererShelter();
	_inst.start();
}
function onUnload() {
	_inst?.stop();
	_inst = null;
}
function MarkdownTableRendererShelter() {
	this.DEBUG = false;
	this.originals = new Map();
	this.log = log;
	this.start = start;
	this.stop = stop;
	this.injectCSS = injectCSS;
	this.removeCSS = removeCSS;
	this.observe = observe;
	this.messageContentNodes = messageContentNodes;
	this.restoreOriginalMessages = restoreOriginalMessages;
	this.isTableRowLine = isTableRowLine;
	this.isSeparatorLine = isSeparatorLine;
	this.splitRow = splitRow;
	this.getAlignment = getAlignment;
	this.parseTable = parseTable;
	this.renderTable = renderTable;
	this.getTextSegments = getTextSegments;
	this.getLinearText = getLinearText;
	this.findTableRanges = findTableRanges;
	this.positionForOffset = positionForOffset;
	this.replaceTextRange = replaceTextRange;
	this.processMessage = processMessage;
	this.processAll = processAll;
}
function log(...args) {
	if (this.DEBUG) console.log("[MTR:shelter]", ...args);
}
function start() {
	this.injectCSS();
	this.processAll();
	this.observe();
}
function stop() {
	this.removeCSS();
	if (this.unobserve) {
		this.unobserve();
		this.unobserve = null;
	}
	if (this.observer) {
		this.observer.disconnect();
		this.observer = null;
	}
	this.restoreOriginalMessages();
}
function injectCSS() {
	if (document.getElementById("mtr-shelter-styles")) return;
	const style = document.createElement("style");
	style.id = "mtr-shelter-styles";
	style.textContent = `
        .mtr-table-wrapper {
            max-width: 100%;
            overflow-x: auto;
            margin: 0.25rem 0 0.5rem;
        }
        .mtr-table-wrapper table[data-mtr="true"] {
            border-collapse: collapse;
            color: inherit;
            font: inherit;
            background: transparent;
            max-width: 100%;
        }
        .mtr-table-wrapper table[data-mtr="true"] th,
        .mtr-table-wrapper table[data-mtr="true"] td {
            border: 1px solid var(--border-subtle, var(--background-modifier-accent, rgba(128, 128, 128, 0.45)));
            padding: 4px 8px;
            color: inherit;
            background: transparent;
            white-space: pre-wrap;
            vertical-align: top;
        }
        .mtr-table-wrapper table[data-mtr="true"] th {
            font-weight: 600;
            background: var(--background-modifier-hover, rgba(128, 128, 128, 0.08));
        }
        .mtr-table-wrapper table[data-mtr="true"] tr:nth-child(2n) td {
            background: var(--background-modifier-hover, rgba(128, 128, 128, 0.04));
        }
    `;
	document.head.appendChild(style);
}
function removeCSS() {
	const style = document.getElementById("mtr-shelter-styles");
	if (style) style.remove();
}
function observe() {
	const observeDom = globalThis.shelter?.plugin?.scoped?.observeDom || globalThis.shelter?.observeDom;
	if (observeDom) {
		this.unobserve = observeDom("div[id^=\"message-content-\"], [class*=\"messageContent\"]", () => this.processAll());
		return;
	}
	this.observer = new MutationObserver(() => this.processAll());
	this.observer.observe(document.body, {
		childList: true,
		subtree: true
	});
}
function messageContentNodes() {
	return Array.from(document.querySelectorAll("div[id^=\"message-content-\"], [class*=\"messageContent\"]"));
}
function restoreOriginalMessages() {
	for (const [el, html] of this.originals.entries()) if (el?.isConnected !== false) {
		el.innerHTML = html;
		delete el.dataset.tableRendered;
	}
	this.originals.clear();
}
function isTableRowLine(line) {
	const t = line.trim();
	return t.includes("|") && t.length > 2;
}
function isSeparatorLine(line) {
	const cells = this.splitRow(line);
	return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}
function splitRow(line) {
	let t = line.trim();
	if (t.startsWith("|")) t = t.slice(1);
	if (t.endsWith("|")) t = t.slice(0, -1);
	const cells = [];
	let current = "";
	let escaped = false;
	for (const ch of t) if (escaped) {
		current += ch;
		escaped = false;
	} else if (ch === "\\") escaped = true;
else if (ch === "|") {
		cells.push(current.trim());
		current = "";
	} else current += ch;
	cells.push(current.trim());
	return cells;
}
function getAlignment(separatorCell) {
	const t = separatorCell.trim();
	if (t.startsWith(":") && t.endsWith(":")) return "center";
	if (t.endsWith(":")) return "right";
	return "left";
}
function parseTable(tableText) {
	const lines = tableText.split("\n").filter((line) => line.trim());
	if (lines.length < 2 || !this.isSeparatorLine(lines[1])) return null;
	const header = this.splitRow(lines[0]);
	const separator = this.splitRow(lines[1]);
	if (header.length === 0 || separator.length === 0) return null;
	const aligns = separator.map((cell) => this.getAlignment(cell));
	const rows = lines.slice(2).filter((line) => this.isTableRowLine(line) && !this.isSeparatorLine(line)).map((line) => this.splitRow(line));
	return {
		header,
		aligns,
		rows
	};
}
function renderTable(tableModel) {
	const wrapper = document.createElement("div");
	wrapper.className = "mtr-table-wrapper";
	const table = document.createElement("table");
	table.dataset.mtr = "true";
	const thead = document.createElement("thead");
	const headerRow = document.createElement("tr");
	tableModel.header.forEach((cell, idx) => {
		const th = document.createElement("th");
		th.textContent = cell;
		th.style.textAlign = tableModel.aligns[idx] || "left";
		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);
	table.appendChild(thead);
	const tbody = document.createElement("tbody");
	tableModel.rows.forEach((row) => {
		const tr = document.createElement("tr");
		const width = Math.max(tableModel.header.length, row.length);
		for (let i = 0; i < width; i++) {
			const td = document.createElement("td");
			td.textContent = row[i] || "";
			td.style.textAlign = tableModel.aligns[i] || "left";
			tr.appendChild(td);
		}
		tbody.appendChild(tr);
	});
	table.appendChild(tbody);
	wrapper.appendChild(table);
	return wrapper;
}
function getTextSegments(root) {
	const segments = [];
	const visit = (node) => {
		if (!node || node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return;
		if (node.nodeType === Node.TEXT_NODE) {
			if (node.nodeValue) segments.push({
				node,
				text: node.nodeValue,
				type: "text"
			});
			return;
		}
		if (node.tagName === "BR") {
			segments.push({
				node,
				text: "\n",
				type: "br"
			});
			return;
		}
		if (node.dataset?.mtr === "true" || node.classList?.contains("mtr-table-wrapper")) return;
		for (const child of Array.from(node.childNodes || [])) visit(child);
	};
	visit(root);
	return segments;
}
function getLinearText(segments) {
	return segments.map((segment) => segment.text).join("");
}
function findTableRanges(text) {
	const lines = text.split("\n");
	const spans = [];
	let offset = 0;
	for (let i = 0; i < lines.length; i++) {
		spans.push({
			start: offset,
			end: offset + lines[i].length,
			text: lines[i]
		});
		offset += lines[i].length + (i < lines.length - 1 ? 1 : 0);
	}
	const ranges = [];
	for (let i = 0; i < lines.length - 1; i++) {
		if (!this.isTableRowLine(lines[i]) || !this.isSeparatorLine(lines[i + 1])) continue;
		let endLine = i + 2;
		while (endLine < lines.length && this.isTableRowLine(lines[endLine]) && !this.isSeparatorLine(lines[endLine])) endLine++;
		const tableLines = lines.slice(i, endLine);
		const tableText = tableLines.join("\n");
		const parsed = this.parseTable(tableText);
		if (parsed) ranges.push({
			start: spans[i].start,
			end: spans[endLine - 1].end,
			tableText,
			parsed
		});
		i = endLine - 1;
	}
	return ranges;
}
function positionForOffset(segments, target, preferEnd) {
	let offset = 0;
	for (const segment of segments) {
		const next = offset + segment.text.length;
		if (target < next || !preferEnd && target === offset || preferEnd && target === next) {
			if (segment.type === "text") return {
				node: segment.node,
				offset: Math.max(0, Math.min(segment.text.length, target - offset)),
				mode: "text"
			};
			return {
				node: segment.node,
				mode: preferEnd ? "after" : "before"
			};
		}
		offset = next;
	}
	const last = segments[segments.length - 1];
	if (!last) return null;
	if (last.type === "text") return {
		node: last.node,
		offset: last.text.length,
		mode: "text"
	};
	return {
		node: last.node,
		mode: "after"
	};
}
function replaceTextRange(root, segments, range, replacement) {
	if (!document.createRange) return false;
	const start$1 = this.positionForOffset(segments, range.start, false);
	const end = this.positionForOffset(segments, range.end, true);
	if (!start$1 || !end) return false;
	const domRange = document.createRange();
	if (start$1.mode === "before") domRange.setStartBefore(start$1.node);
else if (start$1.mode === "after") domRange.setStartAfter(start$1.node);
else domRange.setStart(start$1.node, start$1.offset);
	if (end.mode === "before") domRange.setEndBefore(end.node);
else if (end.mode === "after") domRange.setEndAfter(end.node);
else domRange.setEnd(end.node, end.offset);
	domRange.deleteContents();
	domRange.insertNode(replacement);
	return true;
}
function processMessage(el) {
	if (el.dataset.tableRendered) return false;
	const segments = this.getTextSegments(el);
	const text = this.getLinearText(segments);
	const ranges = this.findTableRanges(text);
	if (!ranges.length) {
		el.dataset.tableRendered = "true";
		return false;
	}
	if (!this.originals.has(el)) this.originals.set(el, el.innerHTML);
	for (let i = ranges.length - 1; i >= 0; i--) {
		const currentSegments = this.getTextSegments(el);
		const tableNode = this.renderTable(ranges[i].parsed);
		this.replaceTextRange(el, currentSegments, ranges[i], tableNode);
	}
	el.dataset.tableRendered = "true";
	return true;
}
function processAll() {
	for (const el of this.messageContentNodes()) this.processMessage(el);
}

//#endregion
exports.onLoad = onLoad
exports.onUnload = onUnload
return exports;
})({});