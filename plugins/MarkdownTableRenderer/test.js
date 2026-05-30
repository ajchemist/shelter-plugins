import { pathToFileURL } from 'url';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- minimal DOM mock ---

class TextNode {
    constructor(value) {
        this.nodeType = 3;
        this.nodeValue = value;
        this.parentNode = null;
    }
}

class MockRange {
    setStart(node, offset) { this._start = { node, offset, mode: 'text' }; }
    setEnd(node, offset) { this._end = { node, offset, mode: 'text' }; }
    setStartBefore(node) { this._start = { node, mode: 'before' }; }
    setStartAfter(node) { this._start = { node, mode: 'after' }; }
    setEndBefore(node) { this._end = { node, mode: 'before' }; }
    setEndAfter(node) { this._end = { node, mode: 'after' }; }
    deleteContents() { /* no-op: text content left in place is harmless for smoke test */ }
    insertNode(node) {
        const ref = this._start?.node;
        const parent = ref?.parentNode;
        if (!parent) return;
        const idx = parent._children.indexOf(ref);
        if (idx !== -1) {
            parent._children.splice(idx, 0, node);
        } else {
            parent._children.push(node);
        }
        node.parentNode = parent;
    }
}

class Element {
    constructor(tag, attrs = {}) {
        this.tagName = tag.toUpperCase();
        this._children = [];
        this.parentNode = null;
        this.nodeType = 1;
        this.attributes = {...attrs};
        this.dataset = {};
        this.style = {};
        this.className = attrs.class || '';
        this.isConnected = true;
        if (attrs.id) this.id = attrs.id;
    }
    get childNodes() { return [...this._children]; }
    get children() { return this._children.filter(n => n.nodeType === 1); }
    appendChild(child) { this._children.push(child); child.parentNode = this; return child; }
    remove() {
        if (this.parentNode) this.parentNode._children = this.parentNode._children.filter(c => c !== this);
        this.isConnected = false;
    }
    set textContent(v) {
        this._children = [];
        if (v) { const tn = new TextNode(String(v)); tn.parentNode = this; this._children = [tn]; }
    }
    get textContent() { return this._children.map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join(''); }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    set innerHTML(v) { this._children = []; if (v) { const tn = new TextNode(String(v)); tn.parentNode = this; this._children = [tn]; } }
    get innerHTML() { return this.textContent; }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    querySelectorAll(sel) {
        const out = [];
        const matchEl = n => {
            if (!n || n.nodeType !== 1) return false;
            if (sel.includes('"messageContent"') && n.className?.includes('messageContent')) return true;
            if (sel.includes('"message-content-"') && typeof n.id === 'string' && n.id.startsWith('message-content-')) return true;
            if (sel === 'table[data-mtr]') return n.tagName === 'TABLE' && !!n.dataset?.mtr;
            if (sel === 'tr') return n.tagName === 'TR';
            if (sel === 'th, td') return n.tagName === 'TH' || n.tagName === 'TD';
            return false;
        };
        const walk = n => { if (matchEl(n)) out.push(n); for (const c of n._children || []) walk(c); };
        walk(this);
        return out;
    }
    compareDocumentPosition() { return 4; }
}

// --- setup ---

const head = new Element('head');
const body = new Element('body');
const msg = new Element('div', {class: 'messageContent-abc'});
msg.innerText = 'before\n| Name | Role | Status |\n|------|------|--------|\n| Alice | Admin | Online |\n| Bob | Member | Idle |\nafter';
body.appendChild(msg);

globalThis.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 };
globalThis.document = {
    head,
    body,
    createElement: tag => new Element(tag),
    createRange: () => new MockRange(),
    getElementById: id => [...head.children, ...body.children].find(e => e.id === id) || null,
    querySelectorAll: sel => {
        const out = [];
        out.push(...head.querySelectorAll(sel));
        out.push(...body.querySelectorAll(sel));
        return out;
    }
};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.shelter = { plugin: { scoped: { observeDom(sel, cb) { document.querySelectorAll(sel).forEach(() => cb()); return () => {}; } } } };

// --- test ---

const { onLoad, onUnload } = await import(
    pathToFileURL(join(__dirname, 'index.js')).href
);

onLoad();

const tables = document.querySelectorAll('table[data-mtr]');
const cellTexts = tables[0]?.querySelectorAll('th, td').map(c => c.innerText);
console.log(JSON.stringify({ tableCount: tables.length, cellTexts, rendered: msg.dataset.tableRendered, styleCount: head.children.length }, null, 2));

if (tables.length !== 1) throw new Error('expected one rendered table');
if (!cellTexts.includes('Alice')) throw new Error('expected table cell Alice');
if (msg.dataset.tableRendered !== 'true') throw new Error('expected rendered marker');

onUnload();
if (head.children.length !== 0) throw new Error('expected CSS cleanup');

console.log('all assertions passed');
