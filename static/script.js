let slides = [];
let currentFilename = '';
let currentPresentationData = null;
let currentPresentationList = []; // Store multiple presentations
let pdfViewer = null;
let currentFileType = '';

/**
 * Uploads files to the server, processes them, and updates the UI.
 */
function uploadFile() {
    const input = document.getElementById('fileInput');
    const fileList = input.files;

    if (!fileList.length) {
        alert("Please select at least one file!");
        return;
    }

    // Show loading indicator
    const uploadStatus = document.getElementById('uploadStatus');
    uploadStatus.textContent = "Uploading and processing files...";
    uploadStatus.style.display = 'block';

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

        uploadStatus.textContent = "Files uploaded successfully!";
        setTimeout(() => {
            uploadStatus.style.display = 'none';
        }, 3000);

        // Handle both single and multiple presentations
        if (Array.isArray(data.presentations)) {
            currentPresentationList = data.presentations;
            currentPresentationData = currentPresentationList[0];
        } else {
            currentPresentationList = [data]; // Wrap single presentation in an array for consistency
            currentPresentationData = data;
        }

        slides = currentPresentationData.slides;
        currentFilename = currentPresentationData.basename || getBaseName(currentPresentationData.filename);
        currentFileType = currentPresentationData.file_type || getFileExtension(currentPresentationData.filename);

        console.log("Loaded presentation:", currentPresentationData);
        updatePresentationList();

        if (slides.length > 0) {
            displayPresentation();
        }
    })
    .catch(err => {
        console.error('Upload error:', err);
        uploadStatus.textContent = 'Upload failed: ' + err.message;
        setTimeout(() => {
            uploadStatus.style.display = 'none';
        }, 5000);
    });
}

/**
 * Retrieves the file extension from a filename.
 */
function getFileExtension(filename) {
    if (!filename) return '';
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex > 0 && dotIndex < filename.length - 1
        ? filename.substring(dotIndex + 1).toLowerCase()
        : '';
}

/**
 * Extracts the base name (filename without extension) from a filename.
 */
function getBaseName(filename) {
    if (!filename) return '';
    const dotIndex = filename.lastIndexOf('.');
    return dotIndex > 0 ? filename.substring(0, dotIndex) : filename;
}

// Modified updatePresentationList function to add active class
function updatePresentationList() {
    const list = document.getElementById('slideList');
    list.innerHTML = '';

    currentPresentationList.forEach((presentation, index) => {
        const li = document.createElement('li');
        const filename = presentation.filename;
        const fileBaseName = getBaseName(filename);
        const extension = filename.split('.').pop().toLowerCase();
        
        // Add class based on file type
        if (extension === 'pdf') {
            li.className = 'pdf-file';
        } else {
            li.className = 'ppt-file';
        }
        
        // Add active class to the current presentation
        if (fileBaseName === currentFilename) {
            li.className += ' active';
        }
        
        li.textContent = fileBaseName;

        li.onclick = () => {
            // Remove active class from all items
            document.querySelectorAll('#slideList li').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to clicked item
            li.classList.add('active');
            
            currentPresentationData = presentation;
            slides = presentation.slides;
            currentFilename = fileBaseName;
            currentFileType = extension;
            displayPresentation();
        };

        list.appendChild(li);
    });
}

// Modified askQuestion function to include visual elements information
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
        // Get the currently displayed slide/page number from the title
        const titleText = document.getElementById('slideTitle').textContent;
        const slideMatch = titleText.match(/(?:Slide|Page) (\d+)/);
        
        if (slideMatch) {
            slideNumber = parseInt(slideMatch[1]);
        } else {
            // If we're not on a specific slide but "current slide only" is selected,
            // show a warning and fall back to current presentation
            alert("You've selected 'Current slide/page only' but aren't viewing a specific slide/page. Searching current presentation instead.");
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

// Modified performSinglePresentationSearch to include visual elements option
function performSinglePresentationSearch(question, slideNumber, filename) {
    // Check if we're using a PDF which might have visual elements
    const isPDF = currentFileType === 'pdf';
    
    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: question,
            slide_number: slideNumber,  // This will be null if searching the whole presentation
            filename: filename,
            include_visual_elements: isPDF // Only include visual elements for PDFs
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        
        // Create a container with presentation source info
        let scopeIndicator = slideNumber ? 
            `${isPDF ? 'Page' : 'Slide'} ${slideNumber} of ${filename}` : 
            filename;
            
        if (data.has_visual_elements) {
            scopeIndicator += ' (including visual elements)';
        }
        
        const answerHTML = `
            <div class="search-result-section">
                <span class="search-scope-indicator">${scopeIndicator}</span>
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

// Fixed function to search across all loaded presentations with ranking
function performCrossPresentationSearch(question) {
    // First gather all filenames from the loaded presentations
    const filenames = currentPresentationList.map(presentation => 
        getBaseName(presentation.filename));
    
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
            
            // Update progress bar
            const progressPercent = (completedQueries / totalPresentations) * 100;
            const progressBar = document.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
            }
            
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
            console.error('Error searching presentation:', filename, err);
            completedQueries++;
            
            // Update progress bar even on error
            const progressPercent = (completedQueries / totalPresentations) * 100;
            const progressBar = document.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = `${progressPercent}%`;
            }
            
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
        answerLower.includes("no information") ||
        answerLower.includes("is not explicitly") ||
        answerLower.includes("implicitly") ||
        answerLower.includes("no mention")) {
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

// Modified function to display slide details with better math content support
function showSlideDetails(index) {
    const slide = slides[index];
    
    document.getElementById('slideTitle').textContent = 
        `${currentFilename} - ${currentFileType === 'pdf' ? 'Page' : 'Slide'} ${index + 1}${slide.title ? ': ' + slide.title : ''}`;
    
    const slideText = document.getElementById('slideText');
    slideText.innerHTML = '';
    
    // Create different views based on file type
    if (currentFileType === 'pdf') {
        // Create a container for the PDF viewer
        const pdfViewerContainer = document.createElement('div');
        pdfViewerContainer.id = 'pdfViewerContainer';
        pdfViewerContainer.className = 'pdf-viewer-container';
        slideText.appendChild(pdfViewerContainer);
        
        // Check if this slide/page has a pre-captured page image (for math content)
        const hasMathContent = slide.has_math_content || false;
        
        // Create a container for the extracted text and visual elements
        const textDataContainer = document.createElement('div');
        textDataContainer.className = 'extracted-data-container';
        
        // Add slide header with page number
        const headerDiv = document.createElement('div');
        headerDiv.className = 'slide-header';
        headerDiv.innerHTML = `<h3>Page ${index + 1}${slide.title ? ': ' + slide.title : ''}</h3>`;
        textDataContainer.appendChild(headerDiv);
        
        // If we have a page image captured (for math content), show it first
        if (hasMathContent && slide.page_image) {
            const mathContentDiv = document.createElement('div');
            mathContentDiv.className = 'math-content-container';
            mathContentDiv.innerHTML = `
                <div class="math-content-notice">
                    <strong>Mathematical Content Detected</strong>
                    <p>This page contains mathematical notation that may not display correctly as text. 
                    A page image has been captured for better visualization.</p>
                </div>
                <div class="page-image-container">
                    <img src="${slide.page_image}" alt="Page ${index + 1} with mathematical content" class="math-page-image">
                </div>
            `;
            textDataContainer.appendChild(mathContentDiv);
        }
        
        // Add extracted text content
        const contentDiv = document.createElement('div');
        contentDiv.className = 'slide-content-text';
        contentDiv.innerHTML = `<h4>Extracted Text:</h4><div>${slide.text.replace(/\n/g, "<br>")}</div>`;
        textDataContainer.appendChild(contentDiv);
        
        // Check for enhanced visual elements (formulas, images)
        fetch(`/pdf-visual-elements/${currentFilename}/${index + 1}`)
            .then(res => res.json())
            .then(data => {
                if (!data.error) {
                    // Add formula section if any formulas exist
                    if (data.formulas && data.formulas.length > 0) {
                        const formulasDiv = document.createElement('div');
                        formulasDiv.className = 'visual-elements formulas';
                        formulasDiv.innerHTML = `<h4>Detected Formulas (${data.formulas.length}):</h4><ul>`;
                        
                        data.formulas.forEach(formula => {
                            // Check if we have an image of the formula
                            let formulaHtml = formula.text;
                            if (formula.image) {
                                formulaHtml = `
                                    <div class="formula-with-image">
                                        <div class="formula-text">${formula.text}</div>
                                        <div class="formula-image">
                                            <img src="${formula.image}" alt="Formula image">
                                        </div>
                                    </div>
                                `;
                            }
                            
                            formulasDiv.innerHTML += `<li>${formulaHtml}</li>`;
                        });
                        
                        formulasDiv.innerHTML += '</ul>';
                        textDataContainer.appendChild(formulasDiv);
                    }
                    
                    // Add image thumbnails if any images exist
                    if (data.images && data.images.length > 0) {
                        const imagesDiv = document.createElement('div');
                        imagesDiv.className = 'visual-elements images';
                        imagesDiv.innerHTML = `<h4>Detected Images (${data.images.length}):</h4><div class="image-grid">`;
                        
                        data.images.forEach(image => {
                            imagesDiv.innerHTML += `
                                <div class="image-thumbnail">
                                    <img src="${image.data_uri}" alt="${image.alt_text}">
                                </div>
                            `;
                        });
                        
                        imagesDiv.innerHTML += '</div>';
                        textDataContainer.appendChild(imagesDiv);
                    }
                }
            })
            .catch(err => console.error('Error loading visual elements:', err));
        
        // Add the text container to the main slide view
        slideText.appendChild(textDataContainer);
        
        // Get the original filename with extension
        let pdfFilename = "";
        if (currentPresentationData && currentPresentationData.filename) {
            pdfFilename = currentPresentationData.filename;
        } else {
            pdfFilename = currentFilename.endsWith('.pdf') ? currentFilename : `${currentFilename}.pdf`;
        }
        
        // URL encode the filename to handle spaces and special characters
        const encodedFilename = encodeURIComponent(pdfFilename);
        const pdfUrl = `/original-file/${encodedFilename}`;
        
        console.log("Loading PDF from URL:", pdfUrl, "Page:", index + 1);
        
        // Initialize or recreate the PDF viewer
        pdfViewer = new PDFViewer('pdfViewerContainer');
        
        // Load the PDF and navigate to the correct page
        pdfViewer.loadDocument(pdfUrl)
            .then(success => {
                if (success) {
                    // Navigate to the specific page (PDF.js pages are 1-indexed)
                    setTimeout(() => {
                        pdfViewer.goToPage(index + 1);
                    }, 100);
                }
            });
    } else {
        // For PowerPoint files, use the original display method
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
        
        slideText.appendChild(slideContent);
    }
    
    // Add back button (common for both PDF and PowerPoint)
    const backButtonContainer = document.createElement('div');
    backButtonContainer.className = 'navigation-buttons';
    
    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Overview';
    backButton.className = 'back-btn';
    backButton.onclick = () => displayPresentation();
    backButtonContainer.appendChild(backButton);
    
    // Add prev/next buttons
    if (index > 0) {
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Previous';
        prevButton.className = 'nav-btn';
        prevButton.onclick = () => showSlideDetails(index - 1);
        backButtonContainer.appendChild(prevButton);
    }
    
    if (index < slides.length - 1) {
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Next';
        nextButton.className = 'nav-btn';
        nextButton.onclick = () => showSlideDetails(index + 1);
        backButtonContainer.appendChild(nextButton);
    }
    
    slideText.appendChild(backButtonContainer);

    // Update radio button state - if on a slide, enable "current slide only" option
    document.getElementById('scopeCurrentSlide').disabled = false;
}

// Modified displayPresentation function to add PDF-specific info
function displayPresentation() {
    // Update the title to show the presentation name
    document.getElementById('slideTitle').textContent = `${currentFilename} (${currentFileType.toUpperCase()})`;
    
    // Since we're not on a specific slide, disable the "current slide only" option
    document.getElementById('scopeCurrentSlide').disabled = true;
    
    // If "current slide only" was selected, switch to "current presentation only"
    if (document.getElementById('scopeCurrentSlide').checked) {
        document.getElementById('scopeCurrentPresentation').checked = true;
    }
    
    const slideText = document.getElementById('slideText');
    slideText.innerHTML = '';
    
    // Create a presentation summary
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'presentation-summary';
    
    // Add presentation info
    const infoP = document.createElement('p');
    infoP.innerHTML = `<strong>Presentation:</strong> ${currentFilename}<br>` +
                      `<strong>Type:</strong> ${currentFileType.toUpperCase()}<br>` +
                      `<strong>Total ${currentFileType === 'pdf' ? 'Pages' : 'Slides'}:</strong> ${slides.length}`;
    summaryDiv.appendChild(infoP);
    
    // For PDFs, add a preview button
    if (currentFileType === 'pdf') {
        const previewButton = document.createElement('button');
        previewButton.className = 'preview-pdf-btn';
        previewButton.textContent = 'Preview Entire PDF';
        previewButton.onclick = () => showPDFPreview(currentFilename);
        summaryDiv.appendChild(previewButton);
    }
    
    // Add a table of contents
    const tocDiv = document.createElement('div');
    tocDiv.className = 'table-of-contents';
    tocDiv.innerHTML = `<h3>${currentFileType === 'pdf' ? 'Pages' : 'Slides'}</h3>`;
    
    const tocList = document.createElement('ol');
    slides.forEach((slide, index) => {
        const tocItem = document.createElement('li');
        // Use the slide title if available, otherwise use "Slide X" or "Page X"
        const itemLabel = currentFileType === 'pdf' ? 'Page' : 'Slide';
        const slideTitle = slide.title ? slide.title : `${itemLabel} ${index + 1}`;
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
    
    // Also handle individual slide links (for both PDF and PowerPoint slides)
    document.querySelectorAll('a[href^="#slide-"]:not([data-range]):not([data-initialized])').forEach(link => {
        link.setAttribute('data-initialized', 'true'); // Mark as initialized
        
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            const slideNum = parseInt(href.replace('#slide-', ''));
            
            if (!isNaN(slideNum) && slideNum > 0 && slideNum <= slides.length) {
                showSlideDetails(slideNum - 1);
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
function callAskQuestion() {
    askQuestion();
    // Wait for the answer to be displayed
    setTimeout(createSlideRangePopup, 500);
}

/**
 * Shows a preview of the entire PDF document.
 */
function showPDFPreview(filename) {
    const slideText = document.getElementById('slideText');
    
    // Clean up existing PDF viewer if present
    if (pdfViewer) {
        const container = document.getElementById('pdfViewerContainer');
        if (container) {
            container.innerHTML = '';
        }
    }
    
    // Update title
    document.getElementById('slideTitle').textContent = `${filename} - Full PDF Preview`;
    slideText.innerHTML = '';
    
    // Create new PDF viewer container
    const pdfContainer = document.createElement('div');
    pdfContainer.id = 'pdfViewerContainer';
    pdfContainer.className = 'pdf-viewer-container pdf-full-view';
    slideText.appendChild(pdfContainer);
    
    // Add back button
    const backButtonContainer = document.createElement('div');
    backButtonContainer.className = 'navigation-buttons';
    
    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Overview';
    backButton.className = 'back-btn';
    backButton.onclick = () => displayPresentation();
    backButtonContainer.appendChild(backButton);
    
    slideText.appendChild(backButtonContainer);
    
    // Load the PDF
    const pdfFilename = currentPresentationData?.filename || 
        (filename.endsWith('.pdf') ? filename : filename + '.pdf');
    const encodedFilename = encodeURIComponent(pdfFilename);
    const pdfUrl = `/original-file/${encodedFilename}`;
    
    console.log("Loading PDF from URL:", pdfUrl);
    
    pdfViewer = new PDFViewer('pdfViewerContainer');
    pdfViewer.loadDocument(pdfUrl);
}

/**
 * Generates an image based on the current slide content.
 */
function generateImageFromSlide() {
    // Get the currently displayed slide content
    let slideContent = "";
    let slideTitle = "";
    
    // Get the currently displayed slide number from the title
    const titleText = document.getElementById('slideTitle').textContent;
    const slideMatch = titleText.match(/(?:Slide|Page) (\d+)/);
    
    if (slideMatch) {
        const slideNumber = parseInt(slideMatch[1]) - 1; // Convert to 0-based index
        if (slides && slides[slideNumber]) {
            const slide = slides[slideNumber];
            slideTitle = slide.title || "";
            slideContent = slide.text || "";
        }
    } else {
        // If no specific slide is shown, use the presentation title
        slideTitle = currentFilename;
    }
    
    // Create a prompt based on slide content
    let prompt = "";
    if (slideTitle && slideContent) {
        // Use the slide title and content to generate a relevant image
        prompt = `Create an image that represents "${slideTitle}". Content: ${slideContent.substring(0, 200)}`;
    } else if (slideTitle) {
        prompt = `Create an image representing "${slideTitle}"`;
    } else if (slideContent) {
        prompt = `Create an image based on: ${slideContent.substring(0, 200)}`;
    } else {
        alert("No slide content available to generate an image from.");
        return;
    }
    
    // Set the prompt in the textarea
    document.getElementById('imagePromptInput').value = prompt;
    
    // Generate the image
    generateImage();
}

/**
 * Generates an image based on the provided prompt.
 */
function generateImage() {
    const prompt = document.getElementById('imagePromptInput').value.trim();
    if (!prompt) {
        alert("Please enter an image prompt!");
        return;
    }
    
    // Show loading indicator
    const imageContainer = document.getElementById('generatedImageContainer');
    const statusDiv = document.getElementById('imageGenerationStatus');
    
    // Create container elements if they don't exist
    if (!imageContainer) {
        const newContainer = document.createElement('div');
        newContainer.id = 'generatedImageContainer';
        document.querySelector('.image-result').appendChild(newContainer);
    }
    
    if (!statusDiv) {
        const newStatus = document.createElement('div');
        newStatus.id = 'imageGenerationStatus';
        document.querySelector('.image-result').appendChild(newStatus);
    }
    
    // Update with loading state
    document.getElementById('generatedImageContainer').innerHTML = '<div class="loading-spinner"></div>';
    document.getElementById('imageGenerationStatus').textContent = "Generating image...";
    
    // Make the API call to generate the image
    fetch('/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
    })
    .then(res => {
        if (!res.ok) throw new Error('Server returned ' + res.status + ': ' + res.statusText);
        return res.json();
    })
    .then(data => {
        const container = document.getElementById('generatedImageContainer');
        const status = document.getElementById('imageGenerationStatus');
        container.innerHTML = '';
        
        if (data.error) {
            status.textContent = 'Error: ' + data.error;
            return;
        }
        
        const img = new Image();
        img.src = data.image_base64.startsWith('data:image') 
            ? data.image_base64 
            : 'data:image/png;base64,' + data.image_base64;
        
        img.alt = prompt;
        img.style.maxWidth = '100%';
        img.style.borderRadius = '8px';
        img.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)';
        
        container.appendChild(img);
        status.textContent = "Image generated successfully!";
    })
    .catch(err => {
        console.error('Image generation error:', err);
        document.getElementById('generatedImageContainer').innerHTML = '';
        document.getElementById('imageGenerationStatus').textContent = 
            'Error: ' + (err.message || "Failed to generate image");
    });
}