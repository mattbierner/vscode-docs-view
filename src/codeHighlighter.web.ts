import * as shiki from 'shiki';
import * as vscode from 'vscode';
import { CodeHighlighter } from './codeHighlighter';

export class CodeHighlighterWeb extends CodeHighlighter {

	protected override async update() {
		shiki.setCDN('https://unpkg.com/shiki/');
		// Only support dark and light for now
		const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light-plus' : 'dark-plus';
		this._highlighter = shiki.getHighlighter({ theme });
	}
}