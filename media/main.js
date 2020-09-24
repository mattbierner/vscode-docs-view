//@ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const main = document.getElementById('main');

    const startingState = vscode.getState();

    // setInterval(() => {
    //     const startingState = vscode.getState();
    //     console.log(startingState ? JSON.stringify(startingState) : undefined);
    // }, 1000);
    
    if (startingState) {
        if (typeof startingState.body === 'string') {
            updateContent();
        } else if (startingState.noContent) {
            setNoContent();
        }
    }

    let hasUpdated = false;

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'update':
                {
                    updateContent(message.body);
                    hasUpdated = true;
                    break;
                }
            case 'noContent':
                {
                    if (!hasUpdated || message.updateMode === 'live') {
                        setNoContent(message.body);
                    }
                    hasUpdated = true;
                    break;
                }
        }
    });

    function updateContent(contents) {
        main.innerHTML = contents;
        vscode.setState({ body: contents });
    }

    function setNoContent(message) {
        main.innerHTML = `<p class="no-content">${message}</p>`;
        vscode.setState({ body: undefined, noContent: true });
    }
}());
