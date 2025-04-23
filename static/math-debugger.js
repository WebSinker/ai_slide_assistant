// Add this JavaScript to a new file called math-debugger.js

function debugMathDetection(filename) {
    // Clear any existing debug info
    const debugContainer = document.getElementById('mathDebugContainer') || 
        createDebugContainer();
    
    debugContainer.innerHTML = `
        <h3>Math Content Detection Analysis</h3>
        <p>Analyzing: ${filename}</p>
        <div class="loading-spinner"></div>
    `;
    
    // Show the debug container
    debugContainer.style.display = 'block';
    
    // Call the backend to analyze math content
    fetch(`/analyze-math/${filename}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                debugContainer.innerHTML = `
                    <h3>Math Content Detection Analysis</h3>
                    <p class="error">Error: ${data.error}</p>
                `;
                return;
            }
            
            // Display the results
            displayMathAnalysisResults(data, debugContainer);
        })
        .catch(error => {
            debugContainer.innerHTML = `
                <h3>Math Content Detection Analysis</h3>
                <p class="error">Error: ${error.message}</p>
            `;
        });
}

function createDebugContainer() {
    // Create a container for the debug information
    const container = document.createElement('div');
    container.id = 'mathDebugContainer';
    container.className = 'debug-container';
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.className = 'close-debug-btn';
    closeButton.onclick = () => container.style.display = 'none';
    container.appendChild(closeButton);
    
    // Add to document
    document.body.appendChild(container);
    
    // Add debug styles if not already present
    addDebugStyles();
    
    return container;
}

function addDebugStyles() {
    if (!document.getElementById('debugStyles')) {
        const style = document.createElement('style');
        style.id = 'debugStyles';
        style.textContent = `
            .debug-container {
                position: fixed;
                top: 50px;
                left: 50px;
                right: 50px;
                bottom: 50px;
                background: white;
                z-index: 1000;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 20px rgba(0,0,0,0.3);
                overflow: auto;
                display: none;
            }
            
            .close-debug-btn {
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 5px 10px;
                background: #e74c3c;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .page-analysis {
                margin-bottom: 20px;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 6px;
            }
            
            .page-analysis.has-math {
                border-left: 4px solid #2ecc71;
            }
            
            .page-analysis.no-math {
                border-left: 4px solid #e74c3c;
            }
            
            .math-indicators {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 10px 0;
            }
            
            .indicator {
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 12px;
                background: #f5f5f5;
            }
            
            .indicator.positive {
                background: #ebfdf2;
                color: #2ecc71;
                border: 1px solid #2ecc71;
            }
            
            .indicator.negative {
                background: #fdf2f0;
                color: #e74c3c;
                border: 1px solid #e74c3c;
            }
            
            .loading-spinner {
                width: 50px;
                height: 50px;
                border: 5px solid #f3f3f3;
                border-top: 5px solid #3498db;
                border-radius: 50%;
                margin: 20px auto;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .math-analysis-summary {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 6px;
                margin-bottom: 20px;
            }
            
            .refresh-btn {
                padding: 8px 15px;
                background: #3498db;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 10px;
            }
        `;
        document.head.appendChild(style);
    }
}

function displayMathAnalysisResults(data, container) {
    const totalPages = data.total_pages;
    const mathPages = data.analysis.filter(page => page.likely_has_math).length;
    
    let html = `
        <h3>Math Content Detection Analysis</h3>
        <div class="math-analysis-summary">
            <p><strong>Filename:</strong> ${data.filename}</p>
            <p><strong>Total Pages:</strong> ${totalPages}</p>
            <p><strong>Pages with Math Content:</strong> ${mathPages} (${Math.round(mathPages/totalPages*100)}%)</p>
            <button class="refresh-btn" onclick="debugMathDetection('${data.filename}')">Refresh Analysis</button>
        </div>
        <h4>Page Details:</h4>
    `;
    
    // Add page-by-page analysis
    data.analysis.forEach(page => {
        const hasMath = page.likely_has_math;
        
        html += `
            <div class="page-analysis ${hasMath ? 'has-math' : 'no-math'}">
                <h4>Page ${page.page_number}</h4>
                <p><strong>First lines:</strong> ${page.first_lines}</p>
                <div class="math-indicators">
                    <span class="indicator ${page.math_detected ? 'positive' : 'negative'}">
                        Algorithm Detection: ${page.math_detected ? 'YES' : 'NO'}
                    </span>
                    <span class="indicator ${page.symbol_count > 3 ? 'positive' : 'negative'}">
                        Math Symbols: ${page.symbol_count}
                    </span>
                    <span class="indicator ${page.greek_letter_count > 0 ? 'positive' : 'negative'}">
                        Greek Letters: ${page.greek_letter_count}
                    </span>
                    <span class="indicator ${page.equation_count > 0 ? 'positive' : 'negative'}">
                        Equations: ${page.equation_count}
                    </span>
                    <span class="indicator ${page.block_math_count > 0 ? 'positive' : 'negative'}">
                        Block Math: ${page.block_math_count}
                    </span>
                    <span class="indicator ${page.is_title_page ? 'negative' : ''}">
                        Title Page: ${page.is_title_page ? 'YES' : 'NO'}
                    </span>
                </div>
                <p><strong>Conclusion:</strong> ${hasMath ? 'Contains mathematical content' : 'No mathematical content detected'}</p>
            </div>
        `;
    });
    
    // Add navigation and additional tools
    html += `
        <div class="debug-tools">
            <button class="refresh-btn" onclick="debugMathDetection('${data.filename}')">Refresh Analysis</button>
        </div>
    `;
    
    container.innerHTML = html;
}

// Add a function to easily add the debug button to the UI
function addMathDebugButton() {
    // Add button to slideList items
    document.querySelectorAll('#slideList li.pdf-file').forEach(li => {
        if (!li.querySelector('.debug-math-btn')) {
            const debugBtn = document.createElement('button');
            debugBtn.className = 'debug-math-btn';
            debugBtn.textContent = 'Debug Math';
            debugBtn.onclick = (e) => {
                e.stopPropagation();  // Prevent triggering the li click
                debugMathDetection(li.textContent);
            };
            li.appendChild(debugBtn);
        }
    });
    
    // Also add a button to the presentation summary
    const summaryDiv = document.querySelector('.presentation-summary');
    if (summaryDiv && currentFileType === 'pdf' && !summaryDiv.querySelector('.debug-math-btn')) {
        const debugBtn = document.createElement('button');
        debugBtn.className = 'debug-math-btn';
        debugBtn.textContent = 'Debug Math Detection';
        debugBtn.onclick = () => debugMathDetection(currentFilename);
        summaryDiv.appendChild(debugBtn);
    }
}

// Call this after the presentation list is updated
document.addEventListener('DOMContentLoaded', function() {
    // Monitor for changes to the slide list
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                setTimeout(addMathDebugButton, 100);
            }
        });
    });
    
    // Start observing the slide list
    const slideList = document.getElementById('slideList');
    if (slideList) {
        observer.observe(slideList, { childList: true, subtree: true });
    }
});

// Add the debug button to existing PDF files in the list
setTimeout(addMathDebugButton, 500);