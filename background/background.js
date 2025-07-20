// --- Storage Helpers ---
const getStorageData = (keys) => chrome.storage.local.get(keys);
const setStorageData = (data) => chrome.storage.local.set(data);

// --- Gemini API Call ---
async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`API request failed: ${errorBody.error?.message || 'Unknown error'}`);
        }
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error("No content generated. The prompt might have been blocked.");
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw error;
    }
}

// --- Prompt Generation ---
function getPrompt(requestType, problem, level, code) {
    const { title, description } = problem;
    const baseInfo = `Problem: "${title}" on LeetCode.\nDescription: ${description}\n\n`;
    switch (requestType) {
        case 'hint': return `${baseInfo}Provide a concise, progressively helpful hint for level ${level} of 5. Generate only the hint for Level ${level}:`;
        case 'solution': return `${baseInfo}Provide a complete, well-commented, and optimal solution in JavaScript. Explain the time and space complexity.`;
        case 'review': return `${baseInfo}Review the following user-submitted code. Identify bugs, and suggest improvements for logic, efficiency, or readability.\n\nUser Code:\n\`\`\`javascript\n${code}\n\`\`\``;
        default: return '';
    }
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        if (request.type === 'getAIResponse') {
            const { apiKey } = await getStorageData(['apiKey']);
            if (!apiKey) {
                sendResponse({ error: "API Key not set. Please set it in the extension popup." });
                return;
            }
            const prompt = getPrompt(request.requestType, request.problem, request.level, request.code);
            try {
                const text = await callGemini(apiKey, prompt);
                sendResponse({ text });
            } catch (error) {
                sendResponse({ error: error.message });
            }
        } else if (request.type === 'getProblemData') {
            const { problems } = await getStorageData(['problems']);
            sendResponse(problems ? problems[request.problemId] : null);
        } else if (request.type === 'saveProblemData') {
            const { stats, problems } = await getStorageData(['stats', 'problems']);
            const currentStats = stats || { totalProblems: 0, totalTime: 0, totalHints: 0, totalSolutions: 0 };
            const allProblems = problems || {};
            const problemId = request.problemId;
            const oldData = allProblems[problemId] || {};
            const newData = request.data;
            if (!oldData.title) { currentStats.totalProblems = (currentStats.totalProblems || 0) + 1; }
            const timeDiff = (newData.timeSpent || 0) - (oldData.timeSpent || 0);
            if (timeDiff > 0) currentStats.totalTime = (currentStats.totalTime || 0) + timeDiff;
            const hintsDiff = (newData.hintsUsed || 0) - (oldData.hintsUsed || 0);
            if (hintsDiff > 0) currentStats.totalHints = (currentStats.totalHints || 0) + hintsDiff;
            if (newData.solutionViewed && !oldData.solutionViewed) { currentStats.totalSolutions = (currentStats.totalSolutions || 0) + 1; }
            allProblems[problemId] = newData;
            await setStorageData({ stats: currentStats, problems: allProblems });
            sendResponse({ success: true });
        } else if (request.type === 'deleteNotes') {
            const { problems } = await getStorageData(['problems']);
            if (problems && problems[request.problemId]) {
                delete problems[request.problemId].notes; // Remove the notes property
                await setStorageData({ problems });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Problem not found' });
            }
        }
    })();
    return true; // Indicate asynchronous response
});
