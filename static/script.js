let slides = [];
let currentFilename = '';
let currentPresentationData = null;
let currentPresentationList = []; // Store multiple presentations

function uploadFile() {
    const input = document.getElementById('fileInput');
    const fileList = input.files; // ← FIX: renamed 'files' to 'fileList'

    if (!fileList.length) {
        alert("Please select at least one file!");
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
        formData.append("files[]", fileList[i]);
    }

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json().catch(() => {
        throw new Error('Server returned invalid JSON');
    }))
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
    
        if (Array.isArray(data.presentations)) {
            currentPresentationList = data.presentations; // Store all
            currentPresentationData = currentPresentationList[0];
            slides = currentPresentationData.slides;
            currentFilename = currentPresentationData.filename.split('.')[0];
    
            updatePresentationList(); // Update sidebar/list
    
            if (slides.length > 0) {
                displayPresentation();
            }
        } else {
            // Fallback if server returns single file structure
            currentPresentationData = data;
            slides = data.slides;
            currentFilename = data.filename.split('.')[0];
            updatePresentationList();
            if (slides.length > 0) {
                displayPresentation();
            }
        }
    
        alert("Files uploaded successfully!");
    })    
    .catch(err => {
        console.error('Upload error:', err);
        alert(`Upload failed: ${err.message}`);
    });
}

function updatePresentationList() {
    const list = document.getElementById('slideList');
    list.innerHTML = '';

    currentPresentationList.forEach((presentation, index) => {
        const li = document.createElement('li');
        const filename = presentation.filename.split('.')[0];
        li.textContent = filename;

        li.onclick = () => {
            currentPresentationData = presentation;
            slides = presentation.slides;
            currentFilename = filename;
            displayPresentation();
        };

        list.appendChild(li);
    });
}

// Modified askQuestion function to search across all presentations
function askQuestion() {
    const question = document.getElementById('questionInput').value.trim();
    if (!question) {
        alert("Please enter a question!");
        return;
    }
    if (currentPresentationList.length === 0) {
        alert("Please upload at least one slide presentation!");
        return;
    }

    // Get the query scope based on radio button selection
    const searchAllPresentations = document.getElementById('scopeAll').checked;
    const searchCurrentPresentation = document.getElementById('scopeCurrentPresentation').checked;
    const searchCurrentSlideOnly = document.getElementById('scopeCurrentSlide').checked;
    
    let slideNumber = null;
    let searchFilename = currentFilename;
    
    if (searchCurrentSlideOnly) {
        // Get the currently displayed slide number from the title
        const titleText = document.getElementById('slideTitle').textContent;
        const slideMatch = titleText.match(/Slide (\d+)/);
        
        if (slideMatch) {
            slideNumber = parseInt(slideMatch[1]);
        } else {
            // If we're not on a specific slide but "current slide only" is selected,
            // show a warning and fall back to current presentation
            alert("You've selected 'Current slide only' but aren't viewing a specific slide. Searching current presentation instead.");
        }
    }
    
    // Show loading indicator
    document.getElementById('answer').innerHTML = "<p>Thinking...</p>";
    
    if (searchAllPresentations && currentPresentationList.length > 1) {
        // Search across all presentations
        performCrossPresentationSearch(question);
    } else {
        // Either search current presentation or current slide
        performSinglePresentationSearch(question, slideNumber, searchFilename);
    }
}

// Search through a single presentation (optionally limited to a specific slide)
function performSinglePresentationSearch(question, slideNumber, filename) {
    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: question,
            slide_number: slideNumber,  // This will be null if searching the whole presentation
            filename: filename
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Create a container with presentation source info
        const answerHTML = `
            <div class="search-result-section">
                <span class="search-scope-indicator">${slideNumber ? 'Slide ' + slideNumber + ' of ' : ''}${filename}</span>
                <div class="search-result-content">
                    ${data.answer}
                </div>
            </div>
        `;
        
        document.getElementById('answer').innerHTML = answerHTML;
        
        // Initialize slide range popup functionality
        createSlideRangePopup();
    })
    .catch(err => {
        console.error(err);
        alert("Failed to get an answer!");
    });
}

// Modified function to search across all loaded presentations with ranking
function performCrossPresentationSearch(question) {
    // First gather all filenames from the loaded presentations
    const filenames = currentPresentationList.map(presentation => 
        presentation.filename.split('.')[0]);
    
    const totalPresentations = filenames.length;
    let completedQueries = 0;
    let combinedResults = [];
    
    // Display a "searching..." message with the presentations being searched
    const searchingHTML = `
        <p>Searching across ${totalPresentations} presentations...</p>
        <div class="searched-presentations">
            ${filenames.map(name => `<span>${name}</span>`).join('')}
        </div>
        <div class="searching-status">
            <div class="progress">
                <div class="progress-bar"></div>
            </div>
        </div>
    `;
    document.getElementById('answer').innerHTML = searchingHTML;
    
    // Process each presentation
    filenames.forEach(filename => {
        fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: question,
                slide_number: null, // Search full presentation
                filename: filename
            })
        })
        .then(res => res.json())
        .then(data => {
            completedQueries++;
            
            if (!data.error) {
                // Add the result with the presentation name
                combinedResults.push({
                    presentationName: filename,
                    answer: data.answer,
                    relevanceScore: calculateRelevanceScore(question, data.answer, filename)
                });
            }
            
            // If all queries are complete, display the combined results
            if (completedQueries === totalPresentations) {
                // Sort results by relevance score (highest first)
                combinedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
                displayCombinedResults(question, combinedResults);
            }
        })
        .catch(err => {
            console.error(err);
            completedQueries++;
            
            // If all queries are complete (even with errors), display what we have
            if (completedQueries === totalPresentations) {
                // Sort results by relevance score (highest first)
                combinedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
                displayCombinedResults(question, combinedResults);
            }
        });
    });
}

// Function to calculate relevance score based on multiple factors
function calculateRelevanceScore(question, answer, filename) {
    let score = 0;
    
    // Factor 1: Keyword matches between question and answer
    const keywords = extractKeywords(question);
    const answerLower = answer.toLowerCase();
    
    keywords.forEach(keyword => {
        const regex = new RegExp(keyword, 'gi');
        const matches = (answer.match(regex) || []).length;
        
        // More matches = higher score
        score += matches * 5;
        
        // Also check for matches in the presentation name
        if (filename.toLowerCase().includes(keyword.toLowerCase())) {
            score += 10; // Higher weight for presentations whose name matches the query
        }
    });
    
    // Factor 2: Length of the answer (longer answers might have more detail)
    // but we don't want to overly reward verbosity
    const wordCount = answer.split(/\s+/).length;
    if (wordCount > 10 && wordCount < 300) {
        score += 5;
    } else if (wordCount >= 300) {
        score += 10;
    }
    
    // Factor 3: Check for direct mentions of slide numbers
    // More slide references suggests the answer is grounded in the content
    const slideRefs = (answer.match(/Slide \d+/g) || []).length;
    score += slideRefs * 3;
    
    // Factor 4: Check if the answer contains phrases like "I found" or "the answer is"
    // which might indicate a more direct answer
    if (answerLower.includes("i found") || 
        answerLower.includes("the answer is") || 
        answerLower.includes("according to the slides")) {
        score += 15;
    }
    
    // Factor 5: Check if answer contains phrases suggesting uncertainty
    if (answerLower.includes("not found") || 
        answerLower.includes("couldn't find") || 
        answerLower.includes("no information")) {
        score -= 20;
    }
    
    return score;
}

// Function to extract keywords from the question
function extractKeywords(question) {
    // Convert to lowercase and remove punctuation
    const cleanQuestion = question.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    
    // Split into words
    const words = cleanQuestion.split(/\s+/);
    
    // Filter out common stop words
    const stopWords = ["a", "an", "the", "and", "or", "but", "is", "are", "in", 
                      "to", "of", "for", "with", "on", "at", "from", "by", "about", 
                      "as", "what", "when", "where", "who", "how", "why", "which"];
    
    const keywords = words.filter(word => !stopWords.includes(word) && word.length > 2);
    
    return keywords;
}

// Function to display the combined search results from all presentations
function displayCombinedResults(question, results) {
    const answerDiv = document.getElementById('answer');
    
    // No results found
    if (results.length === 0) {
        answerDiv.innerHTML = "<p>No answers found across presentations.</p>";
        return;
    }
    
    // Create a nice display of results grouped by presentation
    let combinedHTML = `<h3>Results for: "${question}"</h3>`;
    
    // Add a section for each presentation's results
    results.forEach((result, index) => {
        // Add a badge to the top result
        const topResultBadge = index === 0 ? 
            '<span class="top-result-badge">Most Relevant</span>' : '';
            
        combinedHTML += `
            <div class="search-result-section ${index === 0 ? 'top-result' : ''}">
                <h4>From: ${result.presentationName} ${topResultBadge}</h4>
                <div class="search-result-content">
                    ${result.answer}
                </div>
                <hr>
            </div>
        `;
    });
    
    answerDiv.innerHTML = combinedHTML;
    
    // Initialize slide range popup functionality for the combined results
    createSlideRangePopup();
    
    // Highlight the top result
    const topResult = document.querySelector('.top-result');
    if (topResult) {
        topResult.classList.add('highlight-top-result');
        topResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Update the function that shows a slide to set up proper context
function showSlideDetails(index) {
    const slide = slides[index];
    
    document.getElementById('slideTitle').textContent = 
        `${currentFilename} - Slide ${index + 1}${slide.title ? ': ' + slide.title : ''}`;
    
    const slideText = document.getElementById('slideText');
    slideText.innerHTML = '';
    
    // Create content for the slide
    const slideContent = document.createElement('div');
    slideContent.className = 'slide-details';
    slideContent.id = `slide-${index + 1}`;
    
    // Add slide number and title
    const headerDiv = document.createElement('div');
    headerDiv.className = 'slide-header';
    headerDiv.innerHTML = `<h3>Slide ${index + 1}${slide.title ? ': ' + slide.title : ''}</h3>`;
    slideContent.appendChild(headerDiv);
    
    // Add slide content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'slide-content-text';
    contentDiv.innerHTML = slide.text.replace(/\n/g, "<br>");
    slideContent.appendChild(contentDiv);
    
    // Add notes if any
    if (slide.notes) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'slide-notes';
        notesDiv.innerHTML = `<h4>Notes:</h4><p>${slide.notes.replace(/\n/g, "<br>")}</p>`;
        slideContent.appendChild(notesDiv);
    }
    
    // Add back button
    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Presentation Overview';
    backButton.onclick = () => displayPresentation();
    slideContent.appendChild(backButton);
    
    slideText.appendChild(slideContent);

    // Optional: Scroll into view
    setTimeout(() => {
        const el = document.getElementById(`slide-${index + 1}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
            el.classList.add('flash');
            setTimeout(() => el.classList.remove('flash'), 1000);
        }
    }, 100);
    
    // Update radio button state - if on a slide, enable "current slide only" option
    document.getElementById('scopeCurrentSlide').disabled = false;
}

// Update the displayPresentation function to disable "current slide only" option
function displayPresentation() {
    // Update the title to show the presentation name
    document.getElementById('slideTitle').textContent = currentFilename;
    
    // Since we're not on a specific slide, disable the "current slide only" option
    document.getElementById('scopeCurrentSlide').disabled = true;
    
    // If "current slide only" was selected, switch to "current presentation only"
    if (document.getElementById('scopeCurrentSlide').checked) {
        document.getElementById('scopeCurrentPresentation').checked = true;
    }
    
    // Rest of the function remains the same...
    const slideText = document.getElementById('slideText');
    slideText.innerHTML = '';
    
    // Create a presentation summary
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'presentation-summary';
    
    // Add presentation info
    const infoP = document.createElement('p');
    infoP.innerHTML = `<strong>Presentation:</strong> ${currentFilename}<br>` +
                      `<strong>Total Slides:</strong> ${slides.length}`;
    summaryDiv.appendChild(infoP);
    
    // Add a table of contents
    const tocDiv = document.createElement('div');
    tocDiv.className = 'table-of-contents';
    tocDiv.innerHTML = '<h3>Table of Contents</h3>';
    
    const tocList = document.createElement('ol');
    slides.forEach((slide, index) => {
        const tocItem = document.createElement('li');
        // Use the slide title if available, otherwise use "Slide X"
        const slideTitle = slide.title ? slide.title : `Slide ${index + 1}`;
        tocItem.textContent = slideTitle;
        
        // Make each TOC item clickable to show that specific slide
        tocItem.style.cursor = 'pointer';
        tocItem.onclick = () => showSlideDetails(index);
        
        tocList.appendChild(tocItem);
    });
    
    tocDiv.appendChild(tocList);
    summaryDiv.appendChild(tocDiv);
    
    slideText.appendChild(summaryDiv);
}

// Focus on improving the popup functionality
function createSlideRangePopup() {
    // Create popup element if it doesn't exist
    if (!document.getElementById('slideRangePopup')) {
        const popup = document.createElement('div');
        popup.id = 'slideRangePopup';
        popup.className = 'slide-range-popup';
        popup.style.display = 'none';
        document.body.appendChild(popup);
        
        // Add event listener to popup for when mouse leaves
        popup.addEventListener('mouseleave', function() {
            this.style.display = 'none';
        });
    }
    
    // Add event listeners to all range links that don't already have them
    document.querySelectorAll('a[href="#slide-range"]:not([data-initialized])').forEach(link => {
        link.setAttribute('data-initialized', 'true'); // Mark as initialized
        
        link.addEventListener('mouseenter', function(e) {
            const range = this.getAttribute('data-range').split('-');
            if (range.length === 2) {
                const startSlide = parseInt(range[0]);
                const endSlide = parseInt(range[1]);
                
                if (!isNaN(startSlide) && !isNaN(endSlide)) {
                    showSlideRangePopup(startSlide, endSlide, e);
                }
            }
        });
        
        link.addEventListener('mouseleave', function() {
            setTimeout(() => {
                const popup = document.getElementById('slideRangePopup');
                if (popup && !popup.matches(':hover')) {
                    popup.style.display = 'none';
                }
            }, 200);
        });
        
        // When clicked, don't show the range view but just open the first slide
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const range = this.getAttribute('data-range').split('-');
            if (range.length === 2) {
                const startSlide = parseInt(range[0]);
                
                if (!isNaN(startSlide) && startSlide > 0 && startSlide <= slides.length) {
                    showSlideDetails(startSlide - 1);
                    
                    // Hide popup after clicking
                    const popup = document.getElementById('slideRangePopup');
                    if (popup) {
                        popup.style.display = 'none';
                    }
                }
            }
        });
    });
}

function showSlideRangePopup(startSlide, endSlide, event) {
    // Get valid slide range
    const validStart = Math.max(1, Math.min(startSlide, slides.length));
    const validEnd = Math.max(validStart, Math.min(endSlide, slides.length));
    
    // Get popup element
    const popup = document.getElementById('slideRangePopup');
    
    // Clear previous content
    popup.innerHTML = '';
    
    // Add title
    const title = document.createElement('div');
    title.className = 'popup-title';
    title.textContent = `Go to slide:`;
    popup.appendChild(title);
    
    // Add numbered buttons for each slide
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'popup-buttons';
    
    for (let i = validStart; i <= validEnd; i++) {
        const button = document.createElement('a');
        button.href = '#slide-' + i;
        button.className = 'popup-slide-btn';
        button.textContent = i;
        
        // When clicked, show that specific slide
        button.addEventListener('click', function(e) {
            e.preventDefault();
            showSlideDetails(i - 1);
            popup.style.display = 'none';
        });
        
        buttonContainer.appendChild(button);
    }
    
    popup.appendChild(buttonContainer);
    
    // Position the popup near the mouse
    const mouseX = event.clientX;
    const mouseY = event.clientY;
    
    popup.style.left = `${mouseX}px`;
    popup.style.top = `${mouseY + 20}px`;
    popup.style.display = 'block';
    
    // Make sure popup is in viewport
    setTimeout(() => {
        const rect = popup.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            popup.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            popup.style.top = `${mouseY - rect.height - 10}px`;
        }
    }, 0);
}

// Call this function after the DOM is loaded or any time new content with slide range links is added
document.addEventListener('DOMContentLoaded', function() {
    // Initial setup
    createSlideRangePopup();
    
    // For dynamically added content
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                createSlideRangePopup();
            }
        });
    });
    
    // Start observing the document with the configured parameters
    observer.observe(document.body, { childList: true, subtree: true });
});

// Add this to existing functions that update the DOM with new slide links
function updateSlideLinks() {
    createSlideRangePopup();
}

// Call this after any function that adds new content with slide links
// For example, after displayPresentation() or call to the AI assistant
function callAskQuestion() {
    askQuestion();
    // Wait for the answer to be displayed
    setTimeout(createSlideRangePopup, 500);
}

