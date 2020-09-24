import * as vscode from 'vscode';
import { Renderer } from './renderer';

enum UpdateMode {
	Live = 'live',
	Sticky = 'sticky',
}

export class DocsViewViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'docsView.documentation';

	private readonly _disposables: vscode.Disposable[] = [];

	private readonly _renderer = new Renderer();

	private _view?: vscode.WebviewView;
	private _currentCacheKey: CacheKey = cacheKeyNone;
	private _loading?: { cts: vscode.CancellationTokenSource }

	private _updateMode = UpdateMode.Live;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) {
		vscode.window.onDidChangeActiveTextEditor(() => {
			this.update();
		}, null, this._disposables);

		vscode.window.onDidChangeTextEditorSelection(() => {
			this.update();
		}, null, this._disposables);

		vscode.workspace.onDidChangeConfiguration(() => {
			this.updateConfiguration();
		}, null, this._disposables);

		this.updateConfiguration();
		this.update();
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
				this._extensionUri
			]
		};

		webviewView.onDidChangeVisibility(() => {
			if (this._view?.visible) {
				this.update();
			}
		});

		webviewView.onDidDispose(() => {
			this._view = undefined;
		});

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		this.update();
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		const nonce = getNonce();

		return `<!DOCTYPE html>
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
				
				<title>Documentation View</title>
			</head>
			<body>
				<article id="main"></article>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private async update() {
		if (!this._view) {
			return;
		}

		const newCacheKey = createCacheKey(vscode.window.activeTextEditor);
		if (cacheKeyEquals(this._currentCacheKey, newCacheKey)) {
			return;
		}

		this._currentCacheKey = newCacheKey;

		if (this._loading) {
			this._loading.cts.cancel();
			this._loading = undefined;
		}

		const loadingEntry = { cts: new vscode.CancellationTokenSource() };
		this._loading = loadingEntry;

		return vscode.window.withProgress({ location: { viewId: DocsViewViewProvider.viewType } }, async () => {
			if (!this._view) {
				return;
			}

			const html = await this.getHtmlContentForActiveEditor(loadingEntry.cts.token);
			if (loadingEntry.cts.token.isCancellationRequested) {
				return;
			}

			if (this._loading !== loadingEntry) {
				// A new entry has started loading since we started
				return;
			}

			if (html?.length) {
				this._view?.webview.postMessage({
					type: 'update',
					body: html,
					updateMode: this._updateMode,
				});
			} else {
				this._view?.webview.postMessage({
					type: 'noContent',
					body: 'No documentation found at current cursor position',
					updateMode: this._updateMode,
				});
			}
		});
	}

	private async getHtmlContentForActiveEditor(token: vscode.CancellationToken): Promise<string> {
		if (!vscode.window.activeTextEditor) {
			return '';
		}

		const hovers = await this.getHoversAtCurrentPositionInEditor(vscode.window.activeTextEditor);

		if (token.isCancellationRequested) {
			return '';
		}

		return hovers?.length ? this._renderer.render(hovers) : '';
	}

	private getHoversAtCurrentPositionInEditor(editor: vscode.TextEditor) {
		return vscode.commands.executeCommand<vscode.Hover[]>(
			'vscode.executeHoverProvider',
			editor.document.uri,
			editor.selection.active);
	}

	private updateConfiguration() {
		const config = vscode.workspace.getConfiguration('docsView');
		this._updateMode = config.get<UpdateMode>('documentationView.updateMode') ?? UpdateMode.Live;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}


type CacheKey = typeof cacheKeyNone | DocumentCacheKey;


const cacheKeyNone = { type: 'none' } as const;

class DocumentCacheKey {
	readonly type = 'document';

	constructor(
		public readonly url: vscode.Uri,
		public readonly version: number,
		public readonly wordRange: vscode.Range | undefined,
	) { }

	public equals(other: DocumentCacheKey): boolean {
		if (this.url.toString() !== other.url.toString()) {
			return false;
		}

		if (this.version !== other.version) {
			return false;
		}

		if (!other.wordRange || !this.wordRange) {
			return false;
		}
		return this.wordRange.isEqual(other.wordRange);
	}
}

function cacheKeyEquals(a: CacheKey, b: CacheKey): boolean {
	if (a.type !== b.type) {
		return false;
	}
	if (a.type === 'none' || b.type === 'none') {
		return false;
	}

	return a.equals(b);
}

function createCacheKey(editor: vscode.TextEditor | undefined): CacheKey {
	if (!editor) {
		return cacheKeyNone;
	}

	return new DocumentCacheKey(
		editor.document.uri,
		editor.document.version,
		editor.document.getWordRangeAtPosition(editor.selection.active));
}
