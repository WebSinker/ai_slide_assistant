from PyPDF2 import PdfReader
import os
import time
import json

def extract_text_from_pdf(file_path):
    """Extract text from a PDF file and format it as slides."""
    try:
        # Create a PDF reader object
        reader = PdfReader(file_path)
        slides = []
        
        # Process each page as a slide
        for idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text()
            
            # Try to extract a title from the first line
            lines = text.split('\n')
            title = lines[0] if lines and lines[0].strip() else f"Page {idx}"
            
            # The rest is content
            content = lines[1:] if lines else []
            
            slide_data = {
                "slide_number": idx,
                "title": title,
                "content": content,
                "notes": "",  # PDFs don't have notes like PowerPoint
                "text": text.strip()
            }
            
            slides.append(slide_data)
        
        return slides
        
    except Exception as e:
        print(f"Error extracting text from PDF: {str(e)}")
        return []

def save_extracted_pdf_text(slide_data, filename):
    """Save extracted PDF text to a JSON file."""
    # Create a JSON object that contains all slides
    presentation_data = {
        "filename": filename,
        "total_slides": len(slide_data),
        "extraction_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "slides": slide_data
    }
    
    # Save to a single JSON file
    with open(f'slides/{filename}_slides.json', 'w', encoding='utf-8') as f:
        json.dump(presentation_data, f, indent=2)
    
    return presentation_data