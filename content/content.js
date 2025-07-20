(function() {
    // --- State Management ---
    let panel;
    let problemData = {};
    let timerInterval;
    let seconds = 0;
    let hintsUnlocked = 0;
    let hintContainers = [];
    let solutionVisible = false;
    let lastPathName = '';
    let isPanelInitialized = false;
    let isPanelClosedByUser = false;
    let isTimerPaused = false; // NEW: State for pausing the timer
    let observer;
    let debounceTimer; // Timer for debouncing refresh logic

    // --- Utility Functions ---
    const getProblemId = () => window.location.origin + window.location.pathname;

    const scrapeProblemData = () => {
        const titleEl = document.querySelector('.text-title-large a, .mr-2.text-label-1');
        const descriptionContainer = document.querySelector('div[class^="content__"] div[class^="description__"], ._1l1MA');
        const title = titleEl ? titleEl.innerText : 'Loading...';
        const description = descriptionContainer ? descriptionContainer.innerText.substring(0, 500) + '...' : 'Loading...';
        return { title, description, platform: 'LeetCode' };
    };

    const formatTime = (totalSeconds) => {
        const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const saveData = (dataToSave) => {
        chrome.runtime.sendMessage({
            type: 'saveProblemData',
            problemId: getProblemId(),
            data: { ...problemData, ...dataToSave, lastAccessed: Date.now() }
        });
    };
    
    const showApiKeyPrompt = () => {
        const body = panel.querySelector('.cbai-body');
        if(body) body.innerHTML = `<div class="cbai-api-prompt" style="padding: 20px; text-align: center;"><h4>Activate AI Features</h4><p>To get hints, solutions, and code reviews, please add your Gemini API key.</p><ol style="text-align: left; margin: 15px auto; padding-left: 30px; line-height: 1.7;"><li>Click the <strong>CodeBuddy AI icon</strong> in your browser toolbar.</li><li>Paste your key into the popup window and click <strong>Save</strong>.</li></ol></div>`;
    };
    
    const resetPanel = (forNavigation = false) => {
        if (timerInterval) clearInterval(timerInterval);
        if (panel) panel.remove();
        panel = null;
        isPanelInitialized = false;
        seconds = 0;
        isTimerPaused = false; // Reset pause state on panel reset
        if (forNavigation) {
            init();
        }
    };

    // --- Panel UI and Logic ---
    const createPanel = () => {
        if (document.getElementById('codebuddy-ai-panel')) return;
        panel = document.createElement('div');
        panel.id = 'codebuddy-ai-panel';
        panel.innerHTML = `
            <div class="cbai-header">
                <h2>CodeBuddy AI</h2>
                <div class="cbai-panel-controls">
                    <span class="cbai-timer" id="cbai-timer">00:00:00</span>
                    <!-- NEW: Pause/Play button -->
                    <button class="cbai-header-btn" id="cbai-pause-btn" title="Pause Timer">
                        <svg id="cbai-pause-icon" style="width:18px; height:18px;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        <svg id="cbai-play-icon" style="width:18px; height:18px; display: none;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <button class="cbai-header-btn" id="cbai-refresh-btn" title="Refresh Panel"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></button>
                    <button class="cbai-header-btn" id="cbai-minimize-btn" title="Collapse Panel">&ndash;</button>
                    <button class="cbai-header-btn" id="cbai-close-btn" title="Close Panel">&times;</button>
                </div>
            </div>
            <div class="cbai-body">
                <div class="cbai-problem-info">
                    <h3 id="cbai-problem-title">Loading...</h3>
                    <p><span id="cbai-platform"></span></p>
                </div>
                <div class="cbai-section"><h4>AI Assistance</h4><div class="cbai-section-content" id="cbai-actions"></div></div>
                <div class="cbai-section"><h4>Code Reviewer</h4><div class="cbai-section-content"><textarea id="cbai-code-review-area" class="cbai-textarea" placeholder="Paste your code here..."></textarea><button class="cbai-button" id="cbai-review-btn" style="margin-top: 10px;">Review My Code</button><div class="cbai-display-area" id="cbai-review-result" style="display: none;"></div></div></div>
                <div class="cbai-section"><h4>My Notes</h4><div class="cbai-section-content"><textarea id="cbai-notes-area" class="cbai-textarea" placeholder="Jot down your thoughts..."></textarea><button class="cbai-save-notes-btn" id="cbai-save-notes-btn">Save Notes</button></div></div>
            </div>`;
        document.body.appendChild(panel);
        addPanelEventListeners();
        makeDraggable(panel);
        return panel;
    };
    
    const updatePanelUI = (data) => {
        if (!panel) return;
        panel.querySelector('#cbai-problem-title').textContent = data.title;
        panel.querySelector('#cbai-platform').textContent = data.platform;
        seconds = data.timeSpent || 0;
        panel.querySelector('#cbai-timer').textContent = formatTime(seconds);
        hintsUnlocked = data.hintsUsed || 0;
        solutionVisible = data.solutionViewed || false;
        const actionsHtml = `${[1, 2, 3, 4, 5].map(i => `<button class="cbai-button cbai-hint-btn" id="cbai-hint-btn-${i}" data-level="${i}">Get Hint ${i}</button><div class="cbai-display-area" id="cbai-hint-container-${i}" style="display: none;"></div>`).join('')}<button class="cbai-button cbai-solution-btn" id="cbai-solution-btn">View Solution</button><div class="cbai-display-area" id="cbai-solution-container" style="display: none;"></div>`;
        panel.querySelector('#cbai-actions').innerHTML = actionsHtml;
        hintContainers = Array.from(panel.querySelectorAll('.cbai-hint-btn + .cbai-display-area'));
        for (let i = 1; i <= 5; i++) {
            const hintBtn = panel.querySelector(`#cbai-hint-btn-${i}`);
            const hintContainer = hintContainers[i-1];
            if (data.hints && data.hints[i-1]) {
                hintContainer.textContent = data.hints[i-1];
                hintContainer.style.display = 'block';
            }
            hintBtn.disabled = (i !== hintsUnlocked + 1);
        }
        if (solutionVisible && data.solution) {
            panel.querySelector('#cbai-solution-container').textContent = data.solution;
            panel.querySelector('#cbai-solution-container').style.display = 'block';
            panel.querySelector('#cbai-solution-btn').disabled = true;
        }
        panel.querySelector('#cbai-notes-area').value = data.notes || '';
        const saveBtn = panel.querySelector('#cbai-save-notes-btn');
        if (data.notes) {
            saveBtn.textContent = 'Update Notes';
        }
    };

    const addPanelEventListeners = () => {
        panel.querySelector('#cbai-minimize-btn').addEventListener('click', (e) => {
            panel.classList.toggle('collapsed');
            e.target.innerHTML = panel.classList.contains('collapsed') ? '&#43;' : '&ndash;';
        });
        panel.querySelector('#cbai-close-btn').addEventListener('click', () => {
            isPanelClosedByUser = true;
            resetPanel();
        });
        panel.querySelector('#cbai-refresh-btn').addEventListener('click', (e) => {
            const btn = e.target.closest('.cbai-header-btn');
            btn.classList.add('refreshing');
            resetPanel(true);
            setTimeout(() => {
                const newBtn = document.getElementById('cbai-refresh-btn');
                if (newBtn) newBtn.classList.remove('refreshing');
            }, 1000);
        });
        // NEW: Event listener for the pause button
        panel.querySelector('#cbai-pause-btn').addEventListener('click', (e) => {
            isTimerPaused = !isTimerPaused;
            const btn = e.target.closest('.cbai-header-btn');
            const pauseIcon = btn.querySelector('#cbai-pause-icon');
            const playIcon = btn.querySelector('#cbai-play-icon');

            if (isTimerPaused) {
                btn.title = 'Resume Timer';
                pauseIcon.style.display = 'none';
                playIcon.style.display = 'block';
            } else {
                btn.title = 'Pause Timer';
                pauseIcon.style.display = 'block';
                playIcon.style.display = 'none';
            }
        });
        panel.querySelector('#cbai-actions').addEventListener('click', (e) => {
            if (e.target.matches('.cbai-hint-btn')) handleHintRequest(e);
            if (e.target.matches('.cbai-solution-btn')) handleSolutionRequest(e);
        });
        panel.querySelector('#cbai-review-btn').addEventListener('click', handleCodeReviewRequest);
        panel.querySelector('#cbai-save-notes-btn').addEventListener('click', (e) => {
            const notes = panel.querySelector('#cbai-notes-area').value;
            problemData.notes = notes;
            saveData({ notes: notes });
            const btn = e.target;
            btn.textContent = 'Saved!';
            btn.classList.add('saved');
            setTimeout(() => {
                btn.textContent = 'Update Notes';
                btn.classList.remove('saved');
            }, 1500);
        });
    };

    const handleHintRequest = (e) => {
        const level = parseInt(e.target.dataset.level);
        const container = hintContainers[level-1];
        e.target.disabled = true;
        container.style.display = 'block';
        container.textContent = 'Generating hint...';
        container.classList.add('loading');
        chrome.runtime.sendMessage({ type: 'getAIResponse', problem: problemData, requestType: 'hint', level: level }, (response) => {
            if (chrome.runtime.lastError) { return; }
            container.classList.remove('loading');
            if (response.error) {
                if (response.error.includes("API Key not set")) { showApiKeyPrompt(); } 
                else { container.textContent = `Error: ${response.error}`; }
            } else {
                container.textContent = response.text;
                hintsUnlocked++;
                const existingHints = problemData.hints || [];
                existingHints[level-1] = response.text;
                saveData({ hintsUsed: hintsUnlocked, hints: existingHints });
                if (level < 5) {
                    const nextHintBtn = panel.querySelector(`#cbai-hint-btn-${level + 1}`);
                    if (nextHintBtn) nextHintBtn.disabled = false;
                }
            }
        });
    };
    
    const handleSolutionRequest = (e) => {
        const btn = e.target;
        const container = document.getElementById('cbai-solution-container');
        btn.disabled = true;
        container.style.display = 'block';
        container.textContent = 'Generating solution...';
        container.classList.add('loading');
        chrome.runtime.sendMessage({ type: 'getAIResponse', problem: problemData, requestType: 'solution' }, (response) => {
            if (chrome.runtime.lastError) { return; }
            container.classList.remove('loading');
            if (response.error) {
                if (response.error.includes("API Key not set")) {
                    showApiKeyPrompt();
                } else {
                    container.textContent = `Error: ${response.error}`;
                    btn.disabled = false;
                }
            } else {
                container.textContent = response.text;
                solutionVisible = true;
                saveData({ solutionViewed: true, solution: response.text });
            }
        });
    };
    
    const handleCodeReviewRequest = (e) => {
        const code = document.getElementById('cbai-code-review-area').value;
        if (!code.trim()) { alert('Please paste your code in the text area first.'); return; }
        const btn = e.target;
        const container = document.getElementById('cbai-review-result');
        btn.disabled = true;
        container.style.display = 'block';
        container.textContent = 'Reviewing code...';
        container.classList.add('loading');
        chrome.runtime.sendMessage({ type: 'getAIResponse', problem: problemData, requestType: 'review', code: code }, (response) => {
            if (chrome.runtime.lastError) { return; }
            container.classList.remove('loading');
            btn.disabled = false;
            if (response.error) {
                if (response.error.includes("API Key not set")) {
                    showApiKeyPrompt();
                } else {
                    container.textContent = `Error: ${response.error}`;
                }
            } else {
                container.textContent = response.text;
            }
        });
    };

    const makeDraggable = (element) => {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = element.querySelector('.cbai-header');
        if (header) {
            header.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    };

    const init = () => {
        if (isPanelInitialized) return;
        isPanelInitialized = true;
        createPanel();
        const scrapedData = scrapeProblemData();
        const problemId = getProblemId();
        chrome.runtime.sendMessage({ type: 'getProblemData', problemId }, (storedData) => {
            if (chrome.runtime.lastError) return;
            const isNewProblem = !storedData;
            problemData = { ...scrapedData, ...(storedData || {}), title: scrapedData.title, platform: scrapedData.platform, url: getProblemId() };
            updatePanelUI(problemData);
            if (isNewProblem) {
                saveData({});
            }
            chrome.storage.local.get('apiKey', result => {
                if (chrome.runtime.lastError) return;
                if (!result.apiKey && panel) {
                    showApiKeyPrompt();
                }
            });
        });
        // NEW: Updated timer logic to respect the pause state
        timerInterval = setInterval(() => {
            if (!isTimerPaused) {
                seconds++;
                if(panel && !panel.classList.contains('collapsed')) { 
                    panel.querySelector('#cbai-timer').textContent = formatTime(seconds); 
                }
                if (seconds > 0 && seconds % 30 === 0) {
                    saveData({ timeSpent: seconds });
                }
            }
        }, 1000);
    };
    
    chrome.runtime.onMessage.addListener((request) => {
        if (chrome.runtime.lastError) return;
        if (request.type === 'apiKeyUpdated' || request.type === 'togglePanel') {
            isPanelClosedByUser = false; 
            const existingPanel = document.getElementById('codebuddy-ai-panel');
            if (existingPanel) {
                resetPanel();
            }
            checkAndRun();
        }
    });

    const checkAndRun = () => {
        const url = window.location.href;
        const currentPathName = window.location.pathname;
        if (!url.includes('leetcode.com/problems/')) {
            if (isPanelInitialized) resetPanel();
            lastPathName = '';
            return;
        }
        if (isPanelClosedByUser && currentPathName === lastPathName) {
            return;
        }
        const titleEl = document.querySelector('.text-title-large a, .mr-2.text-label-1');
        if (titleEl) {
            if (currentPathName !== lastPathName) {
                if (isPanelInitialized) resetPanel(true);
                else init();
                lastPathName = currentPathName;
            } else if (!isPanelInitialized) {
                init();
                lastPathName = currentPathName;
            }
        }
    };

    const debouncedCheckAndRun = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(checkAndRun, 500);
    };

    if (observer) observer.disconnect();
    observer = new MutationObserver(debouncedCheckAndRun);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    debouncedCheckAndRun();

})();
