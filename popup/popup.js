document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const apiKeySection = document.getElementById('apiKeySection');
    const clearDataBtn = document.getElementById('clearData');
    const togglePanelBtn = document.getElementById('togglePanelBtn');

    const totalProblemsEl = document.getElementById('totalProblems');
    const totalTimeEl = document.getElementById('totalTime');
    const totalHintsEl = document.getElementById('totalHints');
    const totalSolutionsEl = document.getElementById('totalSolutions');
    const recentProblemsListEl = document.getElementById('recentProblemsList');

    const modal = document.getElementById('notesModal');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalTitleEl = document.getElementById('modalProblemTitle');
    const modalContentEl = document.getElementById('modalNotesContent');

    // --- Functions ---
    const loadData = () => {
        chrome.storage.local.get(['apiKey', 'stats', 'problems'], (result) => {
            if (result.apiKey) {
                apiKeyInput.value = result.apiKey;
                apiKeyStatus.textContent = 'API Key is saved.';
                apiKeyStatus.style.color = '#3fb950';
                apiKeySection.classList.remove('needs-attention');
            } else {
                apiKeyStatus.textContent = 'Add your key to use AI features.';
                apiKeyStatus.style.color = '#f85149';
                apiKeySection.classList.add('needs-attention');
            }

            if (result.stats) {
                totalProblemsEl.textContent = result.stats.totalProblems || 0;
                totalHintsEl.textContent = result.stats.totalHints || 0;
                totalSolutionsEl.textContent = result.stats.totalSolutions || 0;
                const totalSeconds = result.stats.totalTime || 0;
                const totalMinutes = Math.floor(totalSeconds / 60);
                totalTimeEl.textContent = totalMinutes < 60 ? `${totalMinutes}m` : `${Math.floor(totalMinutes/60)}h ${totalMinutes%60}m`;
            }

            recentProblemsListEl.innerHTML = '';
            if (result.problems) {
                const recentProblems = Object.values(result.problems)
                    .sort((a, b) => b.lastAccessed - a.lastAccessed)
                    .slice(0, 10);

                if (recentProblems.length > 0) {
                    recentProblems.forEach(problem => {
                        const listItem = document.createElement('li');
                        
                        const link = document.createElement('a');
                        link.href = problem.url;
                        link.textContent = problem.title || 'Untitled Problem';
                        link.className = 'problem-link';
                        link.target = '_blank';
                        
                        const actionButtons = document.createElement('div');
                        actionButtons.className = 'action-buttons';

                        const notesBtn = document.createElement('button');
                        notesBtn.className = 'icon-btn view-notes-btn';
                        notesBtn.title = 'View Notes';
                        notesBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;
                        notesBtn.onclick = () => showNotesModal(problem);

                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'icon-btn delete-notes-btn';
                        deleteBtn.title = 'Delete Notes';
                        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                        deleteBtn.onclick = () => deleteNotes(problem.url);

                        actionButtons.appendChild(notesBtn);
                        actionButtons.appendChild(deleteBtn);
                        
                        listItem.appendChild(link);
                        listItem.appendChild(actionButtons);
                        recentProblemsListEl.appendChild(listItem);
                    });
                } else {
                    recentProblemsListEl.innerHTML = '<li>No recent problems.</li>';
                }
            }
        });
    };

    const showNotesModal = (problem) => {
        modalTitleEl.textContent = problem.title;
        modalContentEl.textContent = problem.notes || 'No notes have been saved for this problem yet.';
        modal.style.display = 'flex';
    };

    const hideNotesModal = () => {
        modal.style.display = 'none';
    };

    const deleteNotes = (problemId) => {
        if (confirm('Are you sure you want to delete the notes for this problem?')) {
            chrome.runtime.sendMessage({ type: 'deleteNotes', problemId }, () => {
                loadData(); // Refresh the list after deletion
            });
        }
    };

    // --- Event Listeners ---
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey }, () => {
                apiKeyStatus.textContent = 'API Key saved successfully!';
                apiKeyStatus.style.color = '#3fb950';
                apiKeySection.classList.remove('needs-attention');
                setTimeout(() => { apiKeyStatus.textContent = 'API Key is saved.'; }, 2000);
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0] && tabs[0].id) {
                        chrome.tabs.sendMessage(tabs[0].id, { type: "apiKeyUpdated" });
                    }
                });
            });
        } else {
            apiKeyStatus.textContent = 'Please enter a valid API Key.';
            apiKeyStatus.style.color = '#f85149';
        }
    });

    clearDataBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all your data? This action cannot be undone.')) {
            chrome.storage.local.remove(['stats', 'problems'], () => {
                loadData();
                alert('All data has been cleared.');
            });
        }
    });

    togglePanelBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
                chrome.tabs.sendMessage(tabs[0].id, { type: "togglePanel" });
            }
        });
    });

    modalCloseBtn.addEventListener('click', hideNotesModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideNotesModal();
        }
    });

    // --- Initial Load ---
    loadData();
});
