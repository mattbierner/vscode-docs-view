import * as vscode from 'vscode';
import { CodeHighlighterWeb } from './codeHighlighter.web';
import * as ext from './extension';

export function activate(context: vscode.ExtensionContext) {
	return ext.activate(context, new CodeHighlighterWeb(context.extensionUri));
}
