# Change Log

## 0.0.10 - April 3, 2021
- Fix highlighting of php blocks. Thanks @ctf0!

## 0.0.9 - February 5, 2021
- Improve foreground color fallback for themes that don't specify a theme type.

## 0.0.8 - December 15, 2020
- Improve title if docs view is moved into its own view container. Thanks @Saddiel!

## 0.0.7 - October 26, 2020
- Strip html in doc content. This better matches what VS Code's hovers do.
- Fix extra calls to the `vscode.executeHoverProvider` command being made if the cursor is not on a word.

## 0.0.6 - October 20, 2020
- Handle themes that use comments in their source.
- Treat code blocks as if they are of the source document's language by default.

## 0.0.5 - October 19, 2020
- Fix default colors for some dark and light themes.

## 0.0.4 - October 16, 2020
- Enable syntax highlighting for Haskell. Thanks @serras!
- Add explicit extension kind for remote cases (preferring UI).

## 0.0.2 - September 29, 2020
- Fix bundling for publish.
- Extension metadata fixes.

## 0.0.1 - September 29, 2020
- Initial release