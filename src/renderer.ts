import { marked } from 'marked';
import * as vscode from 'vscode';
import { CodeHighlighter } from './codeHighlighter';

export class Renderer {

	private readonly _disposables: vscode.Disposable[] = [];

	private readonly _highlighter: CodeHighlighter;

	public readonly needsRender: vscode.Event<void>;

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

		const highlighter = await this._highlighter.getHighlighter(document);
		return marked(markdown, {
			highlight: highlighter,
			sanitize: true
		});
	}

	public async renderSignature(document: vscode.TextDocument, signatureHelp: vscode.SignatureHelp): Promise<string> {

		if (signatureHelp.signatures.length === 0) {
			return '';
		}

		let parts: any[] = [];
		const activeSignature: any[] = [];

		signatureHelp.signatures.forEach((signatureInformation: vscode.SignatureInformation, index: number) => {
			let pushTo;
			if (signatureHelp.activeSignature === index) {
				pushTo = activeSignature;
			} else {
				pushTo = parts;
			}
			pushTo.push(this.getMarkdown(
				`${String(index + 1).padStart(2, '0')}/${String(signatureHelp.signatures.length).padStart(2, '0')} ${signatureHelp.activeSignature === index ? '🟩' : '⬛'} \`\`\`${signatureInformation.label}\`\`\``));
			if (signatureInformation.documentation) {
				pushTo.push(this.getMarkdown(signatureInformation.documentation as vscode.MarkdownString));
			}
		});
		parts = ['', ...activeSignature, ...parts];

		const markdown = parts.join('\n___\n');

		const highlighter = await this._highlighter.getHighlighter(document);
		return marked(markdown, {
			highlight: highlighter,
			sanitize: true
		});
	}

	private getMarkdown(content: vscode.MarkedString): string {
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
