let slides = [];
let selectedSlide = null;
let currentFilename = '';

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
        slides = data.slides;
        currentFilename = data.filename.split('.')[0];
        populateSlideList();
        alert("File uploaded successfully!");
    })
    .catch(err => {
        console.error('Upload error:', err);
        alert(`Upload failed: ${err.message}`);
    });
}

function populateSlideList() {
    const list = document.getElementById('slideList');
    list.innerHTML = '';
    slides.forEach((slide, index) => {
        const li = document.createElement('li');
        li.textContent = `Slide ${index + 1}`;
        li.onclick = () => selectSlide(index);
        list.appendChild(li);
    });
}

function selectSlide(index) {
    selectedSlide = index;
    document.getElementById('slideTitle').textContent = `Slide ${index + 1}`;
    document.getElementById('slideText').innerHTML = slides[index].text.replace(/\n/g, "<br>");
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

    fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: question,
            slide_number: selectedSlide !== null ? selectedSlide + 1 : null,
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
