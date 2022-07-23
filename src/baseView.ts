import * as vscode from 'vscode';

import { Renderer } from './renderer';

export enum UpdateMode {
	Live = 'live',
	Sticky = 'sticky',
}

export class BaseViewViewProvider implements vscode.WebviewViewProvider {
	protected readonly _disposables: vscode.Disposable[] = [];

	protected readonly _renderer = new Renderer();

	protected _view?: vscode.WebviewView;
	protected _currentCacheKey: CacheKey = cacheKeyNone;
	protected _loading?: { cts: vscode.CancellationTokenSource }

	protected _pinned = false;
	protected _updateMode = UpdateMode.Live;

	resolveWebviewView(_webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext<unknown>, _token: vscode.CancellationToken): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	protected get pinnedContext(): string {
		throw new Error('Method not implemented.');
	}

	public pin() {
		this.updatePinned(true);
	}

	public unpin() {
		this.updatePinned(false);
	}

	private updatePinned(value: boolean) {
		if (this._pinned === value) {
			return;
		}

		this._pinned = value;
		vscode.commands.executeCommand('setContext', this.pinnedContext, value);

		this.update();
	}

	public updateTitle() {
		if (!this._view) {
			return;
		}
		this._view.description = this._pinned ? "(pinned)" : undefined;
	}

	protected async update(_ignoreCache = false) {
		throw new Error('Method not implemented.');
	}

}

export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export type CacheKey = typeof cacheKeyNone | DocumentCacheKey;

export const cacheKeyNone = { type: 'none' } as const;

export class DocumentCacheKey {
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

export function cacheKeyEquals(a: CacheKey, b: CacheKey): boolean {
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

export function createCacheKey(editor: vscode.TextEditor | undefined): CacheKey {
	if (!editor) {
		return cacheKeyNone;
	}

	return new DocumentCacheKey(
		editor.document.uri,
		editor.document.version,
		editor.document.getWordRangeAtPosition(editor.selection.active));
}
