// Listen to storage changes and notify the active tab
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.user_states) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const tab = tabs[0];
      // Check if the tab is still valid and we can send a message
      try {
        chrome.tabs.sendMessage(tab.id, {
          type: "UPDATE_STATES",
          states: changes.user_states.newValue
        }, (response) => {
          // If the content script is not listening, ignore the error
          if (chrome.runtime.lastError) {
            // Silently ignore – the tab might not have our content script
          }
        });
      } catch (_) {
        // Ignore if the extension context is invalid
      }
    });
  }
});