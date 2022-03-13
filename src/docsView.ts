import * as vscode from 'vscode';
import { Renderer } from './renderer';

enum UpdateMode {
	Live = 'live',
	Sticky = 'sticky',
}

type TextEditorDecorationType = ReturnType<typeof vscode.window.createTextEditorDecorationType>;

type PinData = {
	position?: vscode.Position;
	document?: vscode.TextDocument;
	markerStyle: TextEditorDecorationType;
};

export class DocsViewViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'docsView.documentation';

	private static readonly pinnedContext = 'docsView.documentationView.isPinned';

	private readonly _disposables: vscode.Disposable[] = [];

	private readonly _renderer = new Renderer();

	private _view?: vscode.WebviewView;
	private _currentCacheKey: CacheKey = cacheKeyNone;
	private _loading?: { cts: vscode.CancellationTokenSource }

	private _config = {
		updateMode: UpdateMode.Live,
		pinMarkerColor: '' as string | undefined
	}
  private _pin: PinData = { markerStyle: this.createPinMarkerStyle() }

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) {
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        this.updatePinPosition(e);
        this.update();
      },
      null,
      this._disposables
    );

		vscode.window.onDidChangeActiveTextEditor(() => {
			this.update();
			this.updatePinDecoration(this._pin);
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

	public pin() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return;
		const { document, selection: { active: position } } = activeEditor ?? {};
		const { markerStyle } = this._pin;

    this.updatePin(
      document &&
        position && {
          position,
          document,
					markerStyle
        }
    );
  }

  public unpin() {
    this.updatePin(undefined);
  }

	private updatePinPosition(e: vscode.TextDocumentChangeEvent) {
    if (
      !this._pin.position ||
      e.document.uri.path !== this._pin.document?.uri.path ||
      !e.contentChanges.length
    )
      return;

    const { lineDelta, characterDelta, pinWasOverwritten } =
      this.getTranslationTo(this._pin.position, e.contentChanges);

    if (pinWasOverwritten) {
      this.unpin();
    } else {
      this.updatePin({
				...this._pin,
        position: this._pin.position.translate(lineDelta, characterDelta),
      });
    }
  }

	private updatePin(value: PinData | undefined) {
    if (this._pin === value) {
      return;
    }

		this._pin = { ...value, markerStyle: value?.markerStyle ?? this._pin.markerStyle }
    vscode.commands.executeCommand(
      'setContext',
      DocsViewViewProvider.pinnedContext,
      value !== undefined
    );

		this.updatePinDecoration(value)
    this.update();
  }

	private updatePinDecoration(pin?: PinData | undefined) {
		const { activeTextEditor } = vscode.window
		if (
      !activeTextEditor ||
      (pin && pin.document?.uri.path !== activeTextEditor.document.uri.path)
    ) {
      return;
		}

		activeTextEditor.setDecorations(pin?.markerStyle ?? this._pin.markerStyle, []);

		const { pinMarkerColor } = this._config
    if (!pinMarkerColor) return;
		const position = pin?.position ?? this._pin.position
		if (!pin || !position) return;

		const pinDecoration = this.createPinMarkerStyle(pinMarkerColor)
		activeTextEditor.setDecorations(pinDecoration, [
			new vscode.Range(position, position.translate(0, 1)),
		]);
		this._pin.markerStyle = pinDecoration;
	}

	createPinMarkerStyle(pinMarkerColor = this._config.pinMarkerColor): vscode.TextEditorDecorationType {
		return vscode.window.createTextEditorDecorationType({
			textDecoration: `underline 2px ${pinMarkerColor}`,
		});
	}

	private getTranslationTo(
    position: vscode.Position,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ): { lineDelta: number; characterDelta: number; pinWasOverwritten: boolean } {
		const { line: currentLine, character: currentCharacter } = position;
    let lineDelta = 0,
      characterDelta = 0;
    let pinWasOverwritten = false;

    contentChanges.forEach(({ range, text, rangeLength }) => {
      const {
        end: { line: endLine, character: endCharacter },
        start: { line: startLine, character: startCharacter },
      } = range;
      if (startLine > currentLine) return;

      if (this.isInRange(range, position)) {
        pinWasOverwritten = true;
        return;
      }

      const isAddingText = !rangeLength;
      const lines = text.split('\n');

      const changeStartsWithNewline = !lines[0];
      const isEditingLinesBeforeCurrentLine =
        startLine < currentLine ||
        (startLine === currentLine && !changeStartsWithNewline);
      const diff =
        isAddingText && isEditingLinesBeforeCurrentLine
          ? text.split('\n').length - 1
          : endLine - startLine;
      lineDelta += isAddingText ? diff : -diff;

      if (startLine !== currentLine || currentCharacter <= endCharacter) return;
      const changeEndsWithNewline = !lines[lines.length - 1];
      characterDelta += isAddingText
        ? changeEndsWithNewline
          ? 0
          : text.length
        : startCharacter - endCharacter;
    });

    return { lineDelta, characterDelta, pinWasOverwritten };
  }

	private isInRange(
    range: vscode.Range,
    position: vscode.Position | undefined
  ): boolean {
    if (!position) return false;

    const { line, character } = position;
		const {
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter },
    } = range;

    return (
      position.line >= startLine &&
      line <= endLine &&
      character >= startCharacter &&
			(character <= endCharacter || (startCharacter === 0 && endCharacter === 0) && startLine !== endLine && startLine === line)
    );
  }

	private updateTitle() {
		if (!this._view) {
			return;
		}
		this._view.description = this._pin.position ? "(pinned)" : undefined;
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
				
				<title>Documentation View</title>
			</head>
			<body>
				<article id="main"></article>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}

	private async update(ignoreCache = false) {
		if (!this._view) {
			return;
		}

		this.updateTitle();

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
					updateMode: this._config.updateMode,
				});
			} else {
				this._view?.webview.postMessage({
					type: 'noContent',
					body: 'No documentation found at current cursor position',
					updateMode: this._config.updateMode,
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
				return vscode.window.withProgress({ location: { viewId: DocsViewViewProvider.viewType } }, () => updatePromise);
			}),
		]);
	}

	private async getHtmlContentForActiveEditor(token: vscode.CancellationToken): Promise<string> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return '';
		}

		const hovers = await this.getActiveHoverData(editor);

		if (token.isCancellationRequested) {
			return '';
		}

		return hovers?.length ? this._renderer.render(editor.document, hovers) : '';
	}

 /**
   * Gets the hover data for the current location or the pinned locations if a pin is set.
   */
  private getActiveHoverData(editor: vscode.TextEditor) {
    return vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      this._pin.document ? this._pin.document.uri : editor.document.uri,
      this._pin.position ? this._pin.position : editor.selection.active
    );
  }

	private updateConfiguration() {
		const editorConfig = vscode.workspace.getConfiguration('docsView');
		const updateMode = editorConfig.get<UpdateMode>('documentationView.updateMode') || UpdateMode.Live;
		const pinMarkerColor = editorConfig.get<string | undefined>('display.pinMarkerColor');

		this._config = {
			updateMode,
			pinMarkerColor
		}
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

		if (other.wordRange === this.wordRange) {
			return true;
		}

		if (!other.wordRange || !this.wordRange) {
			return false;
		}

		return this.wordRange.isEqual(other.wordRange);
	}
}

function cacheKeyEquals(a: CacheKey, b: CacheKey): boolean {
	if (a === b) {
		return true;
	}

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
