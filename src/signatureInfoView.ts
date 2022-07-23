import * as vscode from 'vscode';

import { BaseViewViewProvider, cacheKeyEquals, createCacheKey, getNonce, UpdateMode } from './baseView';

export class SignatureInfoViewViewProvider extends BaseViewViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'docsView.signatureinfo';

	protected readonly _pinnedContext = 'docsView.signatureInfoView.isPinned';

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) {
		super();
		vscode.window.onDidChangeActiveTextEditor(() => {
			this.update();
		}, null, this._disposables);

		vscode.window.onDidChangeTextEditorSelection(() => {
			this.update();
		}, null, this._disposables);

		this._renderer.needsRender(() => {
			this.update(/* force */ true);
		}, undefined, this._disposables);

		vscode.workspace.onDidChangeConfiguration(() => {
			this.updateConfiguration();
		}, null, this._disposables);

		this.updateConfiguration();
		this.update();
	}

	protected get pinnedContext(): string {
		return this._pinnedContext;
	}

	dispose() {
		let item: vscode.Disposable | undefined;
		while ((item = this._disposables.pop())) {
			item.dispose();
		}
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media')
			]
		};

		webviewView.onDidChangeVisibility(() => {
			if (this._view?.visible) {
				this.update(/* force */ true);
			}
		});

		webviewView.onDidDispose(() => {
			this._view = undefined;
		});

		this.updateTitle();
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		this.update(/* force */ true);
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		const nonce = getNonce();

		return /* html */`<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					style-src ${webview.cspSource} 'unsafe-inline';
					script-src 'nonce-${nonce}';
					img-src data: https:;
					">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleUri}" rel="stylesheet">

				<title>Signature Info View</title>
			</head>
			<body>
				<article id="main"></article>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	protected async update(ignoreCache = false) {
		if (!this._view) {
			return;
		}

		this.updateTitle();

		if (this._pinned) {
			return;
		}

		const newCacheKey = createCacheKey(vscode.window.activeTextEditor);
		if (!ignoreCache && cacheKeyEquals(this._currentCacheKey, newCacheKey)) {
			return;
		}

		this._currentCacheKey = newCacheKey;

		if (this._loading) {
			this._loading.cts.cancel();
			this._loading = undefined;
		}

		const loadingEntry = { cts: new vscode.CancellationTokenSource() };
		this._loading = loadingEntry;

		const updatePromise = (async () => {
			const html = await this.getHtmlContentForActiveEditor(loadingEntry.cts.token);
			if (loadingEntry.cts.token.isCancellationRequested) {
				return;
			}

			if (this._loading !== loadingEntry) {
				// A new entry has started loading since we started
				return;
			}
			this._loading = undefined;

			if (html.length) {
				this._view?.webview.postMessage({
					type: 'update',
					body: html,
					updateMode: this._updateMode,
				});
			} else {
				this._view?.webview.postMessage({
					type: 'noContent',
					body: 'No signature found at current cursor position',
					updateMode: this._updateMode,
				});
			}
		})();

		await Promise.race([
			updatePromise,

			// Don't show progress indicator right away, which causes a flash
			new Promise<void>(resolve => setTimeout(resolve, 250)).then(() => {
				if (loadingEntry.cts.token.isCancellationRequested) {
					return;
				}
				return vscode.window.withProgress({ location: { viewId: SignatureInfoViewViewProvider.viewType } }, () => updatePromise);
			}),
		]);
	}

	private async getHtmlContentForActiveEditor(token: vscode.CancellationToken): Promise<string> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return '';
		}

		const signatureHelp = await this.getSignatureHelpAtCurrentPositionInEditor(editor);

		if (token.isCancellationRequested) {
			return '';
		}

		if (signatureHelp && signatureHelp.signatures && signatureHelp.signatures.length > 0) {
			return this._renderer.renderSignature(editor.document, signatureHelp);
		} else {
			return '';
		}
	}

	private getSignatureHelpAtCurrentPositionInEditor(editor: vscode.TextEditor) {
		return vscode.commands.executeCommand<vscode.SignatureHelp>(
			'vscode.executeSignatureHelpProvider',
			editor.document.uri,
			editor.selection.active);
	}

	private updateConfiguration() {
		const config = vscode.workspace.getConfiguration('docsView');
		this._updateMode = config.get<UpdateMode>('signatureInfoView.updateMode') || UpdateMode.Live;
	}
}



