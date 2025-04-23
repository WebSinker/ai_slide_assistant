// Improved pdf-viewer.js with better canvas management
// This component will handle PDF rendering using PDF.js

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

class PDFViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.pdfDoc = null;
    this.pageNum = 1;
    this.pageRendering = false;
    this.pageNumPending = null;
    this.scale = 1.5;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.currentFilePath = null;
    this.currentRenderTask = null;
    this.isLoading = false;  // Add loading state tracking
    
    // Add the canvas to the container
    this.container.appendChild(this.canvas);
    
    // Create navigation controls
    this.createControls();
    
    // Debug flag
    this.debug = true;
  }
  
  log(message, obj = null) {
    if (this.debug) {
      if (obj) {
        console.log(`[PDFViewer] ${message}`, obj);
      } else {
        console.log(`[PDFViewer] ${message}`);
      }
    }
  }
  
  createControls() {
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'pdf-controls';
    
    // Previous button
    const prevButton = document.createElement('button');
    prevButton.textContent = 'Previous';
    prevButton.className = 'pdf-control-btn';
    prevButton.onclick = () => this.onPrevPage();
    
    // Page indicator
    this.pageInfo = document.createElement('span');
    this.pageInfo.className = 'pdf-page-info';
    this.pageInfo.textContent = `Page: ${this.pageNum}`;
    
    // Next button
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.className = 'pdf-control-btn';
    nextButton.onclick = () => this.onNextPage();
    
    // Zoom controls
    const zoomInButton = document.createElement('button');
    zoomInButton.textContent = 'Zoom In';
    zoomInButton.className = 'pdf-control-btn';
    zoomInButton.onclick = () => this.changeZoom(0.25);
    
    const zoomOutButton = document.createElement('button');
    zoomOutButton.textContent = 'Zoom Out';
    zoomOutButton.className = 'pdf-control-btn';
    zoomOutButton.onclick = () => this.changeZoom(-0.25);
    
    // Assemble controls
    controlsDiv.appendChild(prevButton);
    controlsDiv.appendChild(this.pageInfo);
    controlsDiv.appendChild(nextButton);
    controlsDiv.appendChild(zoomInButton);
    controlsDiv.appendChild(zoomOutButton);
    
    // Insert the controls before the canvas
    this.container.insertBefore(controlsDiv, this.canvas);
  }

  // Add the new clearLoadingIndicator method
  clearLoadingIndicator() {
    const loadingDiv = this.container.querySelector('.loading-pdf');
    if (loadingDiv) {
      this.log("Removing loading indicator");
      loadingDiv.remove();
    }
  }

  async loadDocument(url) {
    try {
      this.log(`Loading PDF from URL: ${url}`);
      this.currentFilePath = url;
      this.isLoading = true;  // Set loading state to true
      
      // Clear any previous renders
      this.cancelCurrentRender();
      
      // Loading message
      this.container.innerHTML = '<div class="loading-pdf">Loading PDF...</div>';
      
      // Recreate the canvas since we removed it
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.container.appendChild(this.canvas);
      
      // Recreate controls
      this.createControls();
      
      // Load the PDF document
      this.log("Starting PDF loading task");
      const loadingTask = pdfjsLib.getDocument(url);
      
      // Add a progress callback
      loadingTask.onProgress = (progressData) => {
        if (progressData.total > 0 && this.isLoading) {
          const percent = (progressData.loaded / progressData.total * 100).toFixed(0);
          const loadingDiv = this.container.querySelector('.loading-pdf');
          if (loadingDiv) {
            loadingDiv.textContent = `Loading PDF... ${percent}%`;
          }
        }
      };
      
      this.pdfDoc = await loadingTask.promise;
      this.log(`PDF loaded successfully. Total pages: ${this.pdfDoc.numPages}`);
      
      // Clear the loading message
      this.clearLoadingIndicator();
      
      // Reset to first page
      this.pageNum = 1;
      
      // Update page info
      this.pageInfo.textContent = `Page: ${this.pageNum} / ${this.pdfDoc.numPages}`;
      
      // Render the first page
      await this.renderPage(this.pageNum);
      
      this.isLoading = false;  // Set loading state to false after successful load
      return true;
    } catch (error) {
      this.log('Error loading PDF:', error);
      this.isLoading = false;  // Set loading state to false on error
      this.container.innerHTML = `<div class="pdf-error">Error loading PDF: ${error.message}</div>`;
      return false;
    }
  } 
  
  cancelCurrentRender() {
    if (this.currentRenderTask) {
      this.log("Cancelling current render task");
      try {
        this.currentRenderTask.cancel();
      } catch (e) {
        this.log("Error cancelling render task", e);
      }
      this.currentRenderTask = null;
    }
    this.pageRendering = false;
  }

  async renderPage(num) {
    if (!this.pdfDoc) {
      this.log("Cannot render page - no PDF document loaded");
      return;
    }
    
    this.cancelCurrentRender();
    this.pageRendering = true;
    
    try {
      // Use the new clearLoadingIndicator method
      this.clearLoadingIndicator();
      
      this.log(`Rendering page ${num}`);
      
      // Fetch the page
      const page = await this.pdfDoc.getPage(num);
      this.log(`Page ${num} fetched successfully`);
      
      // Prepare canvas using PDF page dimensions
      const viewport = page.getViewport({ scale: this.scale });
      this.canvas.height = viewport.height;
      this.canvas.width = viewport.width;
      
      // Render PDF page into canvas context
      const renderContext = {
        canvasContext: this.ctx,
        viewport: viewport
      };
      
      this.log("Starting render task");
      const renderTask = page.render(renderContext);
      this.currentRenderTask = renderTask;
      
      await renderTask.promise;
      this.log(`Page ${num} rendered successfully`);
      
      this.currentRenderTask = null;
      this.pageRendering = false;
      
      // Update page counter
      this.pageInfo.textContent = `Page: ${this.pageNum} / ${this.pdfDoc.numPages}`;
      
      // Process pending page if any
      if (this.pageNumPending !== null) {
        const pendingPage = this.pageNumPending;
        this.pageNumPending = null;
        this.log(`Processing pending page: ${pendingPage}`);
        this.renderPage(pendingPage);
      }
    } catch (error) {
      // Check if this is a cancelled render error (which is expected behavior when switching pages)
      if (error && error.message === 'Rendering cancelled') {
        this.log("Render cancelled (expected behavior)");
      } else {
        this.log('Error rendering page:', error);
        this.container.innerHTML += `<div class="pdf-error">Error rendering page: ${error.message}</div>`;
      }
      
      this.currentRenderTask = null;
      this.pageRendering = false;
      this.isLoading = false;  // Ensure loading state is false on error
      
      // Still process pending page if any, even after an error
      if (this.pageNumPending !== null) {
        const pendingPage = this.pageNumPending;
        this.pageNumPending = null;
        this.renderPage(pendingPage);
      }
    }
  }
  
  queueRenderPage(num) {
    if (this.pageRendering) {
      this.log(`Page render in progress. Queuing page ${num} for later rendering`);
      this.pageNumPending = num;
    } else {
      this.renderPage(num);
    }
  }
  
  onPrevPage() {
    if (!this.pdfDoc || this.pageNum <= 1) return;
    this.pageNum--;
    this.log(`Navigating to previous page: ${this.pageNum}`);
    this.queueRenderPage(this.pageNum);
  }
  
  onNextPage() {
    if (!this.pdfDoc || this.pageNum >= this.pdfDoc.numPages) return;
    this.pageNum++;
    this.log(`Navigating to next page: ${this.pageNum}`);
    this.queueRenderPage(this.pageNum);
  }
  
  changeZoom(delta) {
    this.scale += delta;
    // Limit zoom level
    if (this.scale < 0.5) this.scale = 0.5;
    if (this.scale > 3) this.scale = 3;
    
    this.log(`Changing zoom to: ${this.scale}`);
    this.queueRenderPage(this.pageNum);
  }
  
  getCurrentPageNumber() {
    return this.pageNum;
  }
  
  getTotalPages() {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }
  
  // Add a method to get page text content (for AI processing)
  async getPageTextContent(pageNum) {
    if (!this.pdfDoc) return null;
    
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Convert text items to a string
      let textItems = textContent.items.map(item => item.str);
      return textItems.join(' ');
    } catch (error) {
      this.log('Error getting page text content:', error);
      return null;
    }
  }
  
  // Method to jump to a specific page
  goToPage(pageNum) {
    if (!this.pdfDoc) return;
    
    const targetPage = Math.max(1, Math.min(pageNum, this.pdfDoc.numPages));
    if (targetPage !== this.pageNum) {
      this.log(`Jumping to page ${targetPage}`);
      this.pageNum = targetPage;
      this.queueRenderPage(this.pageNum);
      return true;
    }
    return false;
  }
}