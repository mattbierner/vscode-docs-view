import * as vscode from 'vscode';
import { DocsViewViewProvider } from './docsView';
import { SignatureInfoViewViewProvider } from './signatureInfoView';

export function activate(context: vscode.ExtensionContext) {

	const provider = new DocsViewViewProvider(context.extensionUri);
	context.subscriptions.push(provider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(DocsViewViewProvider.viewType, provider));

	const signatureInfoViewViewProvider = new SignatureInfoViewViewProvider(context.extensionUri);
	context.subscriptions.push(signatureInfoViewViewProvider);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SignatureInfoViewViewProvider.viewType, signatureInfoViewViewProvider));

	context.subscriptions.push(
		vscode.commands.registerCommand('docsView.documentationView.pin', () => {
			provider.pin();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('docsView.documentationView.unpin', () => {
			provider.unpin();
		}));
}
