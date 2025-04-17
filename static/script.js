let slides = [];
let currentFilename = '';
let currentPresentationData = null;

function uploadFile() {
    const input = document.getElementById('fileInput');
    const file = input.files[0];

    if (!file) {
        alert("Please select a file first!");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

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
        
        // Store the entire presentation data
        currentPresentationData = data;
        slides = data.slides;
        currentFilename = data.filename.split('.')[0];
        
        // Update the sidebar to show just the presentation name
        updatePresentationList();
        
        // Show the first slide by default
        if (slides.length > 0) {
            displayPresentation();
        }
        
        alert("File uploaded successfully!");
    })
    .catch(err => {
        console.error('Upload error:', err);
        alert(`Upload failed: ${err.message}`);
    });
}

function updatePresentationList() {
    const list = document.getElementById('slideList');
    list.innerHTML = '';
    
    // Create a single entry for the presentation
    if (currentFilename) {
        const li = document.createElement('li');
        li.textContent = currentFilename;
        li.onclick = () => displayPresentation();
        list.appendChild(li);
    }
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
        document.getElementById('answer').textContent = data.answer;
    })
    .catch(err => {
        console.error(err);
        alert("Failed to get an answer!");
    });
}
