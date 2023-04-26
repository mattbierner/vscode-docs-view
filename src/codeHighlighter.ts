import json5 from 'json5';
import * as shiki from 'shiki';
import { Highlighter } from 'shiki'
import type { Theme, IShikiTheme } from 'shiki'
import * as vscode from 'vscode';

declare const TextDecoder: any;

// Default themes use `include` option that shiki doesn't support
const defaultThemesMap = new Map<string, Theme>([
	['Default Light+', 'light-plus'],
	['Default Dark+', 'dark-plus'],
]);

function getCurrentThemePath(themeName: string): vscode.Uri | undefined {
	for (const ext of vscode.extensions.all) {
		const themes = ext.packageJSON.contributes && ext.packageJSON.contributes.themes;
		if (!themes) {
			continue;
		}

		const theme = themes.find((theme: any) => theme.label === themeName || theme.id === themeName);
		if (theme) {
			return vscode.Uri.joinPath(ext.extensionUri, theme.path);
		}
	}
}

export class CodeHighlighter {

	private readonly _disposables: vscode.Disposable[] = [];

	private _highlighter?: Promise<Highlighter>;

	constructor() {
		this._needsRender = new vscode.EventEmitter<void>();
		this._disposables.push(this._needsRender);
		this.needsRender = this._needsRender.event;

		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.colorTheme')) {
				this.update().then(() => {
					this._needsRender.fire();
				});
			}
		}, null, this._disposables);

		this.update();
	}

	private readonly _needsRender: vscode.EventEmitter<void>;
	public readonly needsRender: vscode.Event<void>;

	dispose() {
		let item: vscode.Disposable | undefined;
		while ((item = this._disposables.pop())) {
			item.dispose();
		}
	}

	public async getHighlighter(document: vscode.TextDocument): Promise<(code: string, language: string) => string> {
		const highlighter = await this._highlighter;

		return (code: string, inputLanguage: string): string => {
			const languageId = inputLanguage || document.languageId;
			if (languageId && highlighter) {
				try {
					return highlighter.codeToHtml(code, { lang: languageId });
				} catch (err) {
					// noop
				}
			}

			return code;
		};
	}

	private async update() {
		const theme = (await CodeHighlighter.getShikiTheme()) ?? 'dark-plus';
		this._highlighter = shiki.getHighlighter({ theme });
	}

	private static async getShikiTheme(): Promise<IShikiTheme | undefined> {
		let theme: string | IShikiTheme | undefined;

		const currentThemeName = vscode.workspace.getConfiguration('workbench').get<string>('colorTheme');
		if (currentThemeName && defaultThemesMap.has(currentThemeName)) {
			theme = defaultThemesMap.get(currentThemeName);
		} else if (currentThemeName) {
			const colorThemePath = getCurrentThemePath(currentThemeName);
			if (colorThemePath) {
				theme = await shiki.loadTheme(colorThemePath.fsPath);

				theme.name = 'random'; // Shiki doesn't work without name and defaults to `Nord`

				// Add explicit default foreground color rule to match VS Code
				// https://github.com/shikijs/shiki/issues/45
				theme.settings.push({
					settings: {
						foreground: await getDefaultForeground(colorThemePath),
					}
				});
			}
		}

		if (typeof theme === 'string') {
			// @ts-ignore
			theme = shiki.getTheme(theme) as IShikiTheme
		}

		if (theme && theme.colors) {
			theme.bg = ' '; // Don't set bg so that we use the view's background instead
			theme.colors['editor.background'] = ' ';
		}
		return theme;
	}
}

const defaultDarkForeground = '#cccccc';
const defaultLightForeground = '#333333';

async function getDefaultForeground(uri: vscode.Uri): Promise<string> {
	try {
		const buffer = await vscode.workspace.fs.readFile(uri);
		const contents = new TextDecoder("utf-8").decode(buffer);
		const json = json5.parse(contents);

		// Prefer using the explicit `editor.foreground` if it is set
		const editorForeground = json.colors?.['editor.foreground'];
		if (editorForeground) {
			return editorForeground;
		}

		// Otherwise try falling back to type specified in theme
		const themeType = json['type'];
		if (typeof themeType === 'string') {
			return themeType.toLowerCase() === 'light'
				? defaultLightForeground
				: defaultDarkForeground;
		}
	} catch (e) {
		// noop
	}

	// Finally fallback to the active theme
	return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
		? defaultLightForeground
		: defaultDarkForeground;
}