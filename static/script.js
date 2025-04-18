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

function displayPresentation() {
    // Update the title to show the presentation name
    document.getElementById('slideTitle').textContent = currentFilename;
    
    // Display a summary of the presentation
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
            el.scrollIntoView({ behavior: 'smooth' }); // ✅ Smooth scroll
            el.classList.add('flash');                 // ✅ Flash highlight
            setTimeout(() => el.classList.remove('flash'), 1000);
        }
    }, 100);
}

function askQuestion() {
    const question = document.getElementById('questionInput').value.trim();
    if (!question) {
        alert("Please enter a question!");
        return;
    }
    if (!currentFilename) {
        alert("Please upload a slide first!");
        return;
    }

    // Get the currently displayed slide number from the title
    let slideNumber = null;
    const titleText = document.getElementById('slideTitle').textContent;
    const slideMatch = titleText.match(/Slide (\d+)/);
    if (slideMatch) {
        slideNumber = parseInt(slideMatch[1]);
    }

    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: question,
            slide_number: slideNumber,
            filename: currentFilename
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert(data.error);
            return;
        }
        document.getElementById('answer').innerHTML = data.answer;
    })
    .catch(err => {
        console.error(err);
        alert("Failed to get an answer!");
    });
}

document.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
        // Handle individual slide links
        if (e.target.getAttribute('href')?.startsWith('#slide-')) {
            e.preventDefault();
            const slideNum = parseInt(e.target.getAttribute('href').replace('#slide-', ''));
            if (!isNaN(slideNum)) {
                showSlideDetails(slideNum - 1);
            }
        }
    }
});

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

