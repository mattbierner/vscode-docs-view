import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Marked } from "marked";
import * as vscode from 'vscode';
import { CodeHighlighter } from './codeHighlighter';

export class Renderer {

	private readonly _disposables: vscode.Disposable[] = [];

	private readonly _highlighter: CodeHighlighter;

	public readonly needsRender: vscode.Event<void>;

	private readonly _purify = DOMPurify(new JSDOM('').window);

	constructor() {
		this._highlighter = new CodeHighlighter();
		this._disposables.push(this._highlighter);

		this.needsRender = this._highlighter.needsRender;
	}

	dispose() {
		let item: vscode.Disposable | undefined;
		while ((item = this._disposables.pop())) {
			item.dispose();
		}
	}

	public async render(document: vscode.TextDocument, hovers: readonly vscode.Hover[]): Promise<string> {
		const parts = (hovers)
			.flatMap(hover => hover.contents)
			.map(content => this.getMarkdown(content))
			.filter(content => content.length > 0);

		if (!parts.length) {
			return '';
		}

		const markdown = parts.join('\n---\n');

		const highlight = await this._highlighter.getHighlighter(document);
		const marked = new Marked({
			renderer: {
				code: (code: string, infostring: string | undefined, _escaped: boolean) => highlight(code, infostring ?? '')
			}
		});

		const renderedMarkdown = await marked.parse(markdown, {});
		return this._purify.sanitize(renderedMarkdown, { USE_PROFILES: { html: true } });
	}

	private getMarkdown(content: vscode.MarkedString | vscode.MarkdownString): string {
		if (typeof content === 'string') {
			return content;
		} else if (content instanceof vscode.MarkdownString) {
			return content.value;
		} else {
			const markdown = new vscode.MarkdownString();
			markdown.appendCodeblock(content.value, content.language);
			return markdown.value;
		}
	}
}
