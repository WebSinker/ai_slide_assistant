from PyPDF2 import PdfReader
import os
import time
import json
import base64
import re
import fitz  # PyMuPDF for more advanced PDF processing

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
                "text": text.strip(),
                "original_file": os.path.basename(file_path),
                "page_number": idx,  # For PDF we use page number instead of slide number
                "has_math_content": False,  # Will be updated during formula detection
                "page_image": ""  # Will be filled with page image if math content is detected
            }
            
            slides.append(slide_data)
        
        # Now capture images of pages with formulas
        slides = capture_page_images_with_formulas(file_path, slides)
        
        return slides
        
    except Exception as e:
        print(f"Error extracting text from PDF: {str(e)}")
        return []

def detect_math_content(text):
    """Detect potential mathematical content in text."""
    # Math symbols and patterns to check for
    math_symbols = r'[=+\-*/^√∫∑∏πα-ωΑ-Ω∈∉⊂⊃∪∩≈≠≤≥±∞{}()\[\]]'
    math_patterns = [
        r'\$.*?\$',  # LaTeX inline mode
        r'\$\$.*?\$\$',  # LaTeX display mode
        r'\\begin\{equation\}.*?\\end\{equation\}',  # LaTeX equation environment
        r'\\frac\{.*?\}\{.*?\}',  # LaTeX fractions
        r'[A-Za-z]_\{[^\}]+\}',  # Subscripts
        r'[A-Za-z]\^[A-Za-z0-9]',  # Superscripts
        r'\\[a-zA-Z]+',  # LaTeX commands
        r'[A-Z]\s*∩\s*[A-Z]',  # Set intersection
        r'[A-Z]\s*∪\s*[A-Z]',  # Set union
        r'[a-z]\s*∈\s*[A-Z]',  # Element of
        r'\(.*?\)',  # Parentheses (often used in math)
        r'\{.*?\}',  # Curly braces (often used in math)
        r'\[.*?\]',  # Square brackets
        r'CHAPTER \d+\. NUMBER SETS',  # Context clue for math content
        r'Figure \d+\.',  # Figures often contain mathematical notation
    ]
    
    # Check for math symbols
    if re.search(math_symbols, text):
        return True
    
    # Check for math patterns
    for pattern in math_patterns:
        if re.search(pattern, text):
            return True
    
    # Check for special sequences that often indicate garbled math notation
    garbled_patterns = [
        r'çää',
        r'ïäïäïó',
        r'^ _ _ \^',
        r'∅',
        r'∧',
        r'∀',
        r'∃',
        r'≡',
    ]
    
    for pattern in garbled_patterns:
        if pattern in text:
            return True
    
    return False

def capture_page_images_with_formulas(file_path, slides):
    """Capture images of pages that contain mathematical formulas."""
    try:
        # Open the PDF with PyMuPDF
        doc = fitz.open(file_path)
        
        for i, slide in enumerate(slides):
            page_num = slide["slide_number"] - 1  # 0-based page index
            
            # Check if this page has mathematical content
            has_math = detect_math_content(slide["text"])
            
            # Mark the slide as containing math
            slide["has_math_content"] = has_math
            
            # If it has math content, capture an image of the entire page
            if has_math and page_num < len(doc):
                try:
                    page = doc[page_num]
                    # Render the page at a higher resolution for better quality
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("png")
                    img_b64 = base64.b64encode(img_data).decode('utf-8')
                    slide["page_image"] = f"data:image/png;base64,{img_b64}"
                    print(f"Captured image for page {page_num + 1} with math content")
                except Exception as e:
                    print(f"Error capturing page image: {e}")
        
        return slides
    except Exception as e:
        print(f"Error in capturing page images: {str(e)}")
        return slides

def extract_formulas_from_pdf(file_path):
    """Extract areas that likely contain mathematical formulas from PDF for visual reference."""
    try:
        doc = fitz.open(file_path)
        formula_data = []
        
        for page_num, page in enumerate(doc):
            # Get the page text with detailed layout information
            text_blocks = page.get_text("dict")["blocks"]
            
            # Identify potential formula areas
            for block in text_blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        line_text = "".join([span["text"] for span in line["spans"]])
                        
                        # Check if this line contains math content
                        if detect_math_content(line_text):
                            # Capture this area as an image
                            try:
                                # Get the bounding box of the line
                                rect = fitz.Rect(line["bbox"])
                                # Expand slightly to ensure full formula capture
                                rect.x0 = max(0, rect.x0 - 10)
                                rect.y0 = max(0, rect.y0 - 10)
                                rect.x1 = min(page.rect.width, rect.x1 + 10)
                                rect.y1 = min(page.rect.height, rect.y1 + 10)
                                
                                # Render just this area of the page
                                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect)
                                img_data = pix.tobytes("png")
                                img_b64 = base64.b64encode(img_data).decode('utf-8')
                                
                                formula_data.append({
                                    "page": page_num + 1,
                                    "text": line_text,  # Still include the text for context
                                    "bbox": list(line["bbox"]),  # Convert to list for JSON serialization
                                    "type": "potential_formula",
                                    "image": f"data:image/png;base64,{img_b64}"
                                })
                            except Exception as e:
                                print(f"Error capturing formula image: {e}")
        
        return formula_data
    
    except Exception as e:
        print(f"Error extracting formulas from PDF: {str(e)}")
        return []

def extract_images_from_pdf(file_path):
    """Extract images from PDF and their positions with additional metadata."""
    try:
        doc = fitz.open(file_path)
        image_data = []
        
        for page_num, page in enumerate(doc):
            # Extract images
            images = page.get_images(full=True)
            
            for img_index, img in enumerate(images):
                xref = img[0]  # image reference
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                
                # Get more details about the image
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
                colorspace = base_image.get("colorspace", "unknown")
                
                # Try to get the image position on the page
                image_rect = None
                try:
                    for item in page.get_drawings():
                        if item.get("type") == "image" and item.get("xref") == xref:
                            image_rect = item.get("rect")
                            break
                except Exception as e:
                    print(f"Error getting image position: {e}")
                
                # Encode as base64 for web display
                image_b64 = base64.b64encode(image_bytes).decode('utf-8')
                
                # Create more detailed image data
                img_data = {
                    "page": page_num + 1,
                    "index": img_index,
                    "width": width,
                    "height": height,
                    "format": image_ext,
                    "colorspace": colorspace,
                    "data_uri": f"data:image/{image_ext};base64,{image_b64}",
                    "alt_text": f"Image on page {page_num + 1}"
                }
                
                # Add position data if available
                if image_rect:
                    img_data["position"] = {
                        "x1": image_rect.x0,
                        "y1": image_rect.y0,
                        "x2": image_rect.x1,
                        "y2": image_rect.y1,
                        "width": image_rect.width,
                        "height": image_rect.height,
                    }
                
                # Add image description using OCR if possible
                try:
                    import pytesseract
                    from PIL import Image
                    import io
                    
                    pil_image = Image.open(io.BytesIO(image_bytes))
                    ocr_text = pytesseract.image_to_string(pil_image)
                    if ocr_text and len(ocr_text.strip()) > 0:
                        img_data["ocr_text"] = ocr_text.strip()
                        img_data["alt_text"] = f"Image containing: {ocr_text[:100]}..." if len(ocr_text) > 100 else f"Image containing: {ocr_text}"
                except Exception as e:
                    print(f"OCR error for image: {e}")
                
                image_data.append(img_data)
                
        return image_data
                
    except Exception as e:
        print(f"Error extracting images from PDF: {str(e)}")
        return []

def extract_pdf_metadata(file_path):
    """Extract comprehensive metadata from the PDF."""
    try:
        # Using both PyPDF2 and PyMuPDF for different aspects
        reader = PdfReader(file_path)
        doc = fitz.open(file_path)
        
        metadata = {
            "file_name": os.path.basename(file_path),
            "pages": len(reader.pages),
            "title": reader.metadata.title if reader.metadata.title else "No title",
            "author": reader.metadata.author if reader.metadata.author else "Unknown",
            "creation_date": reader.metadata.creation_date.strftime('%Y-%m-%d %H:%M:%S') if reader.metadata.creation_date else "Unknown",
            "modification_date": reader.metadata.modification_date.strftime('%Y-%m-%d %H:%M:%S') if reader.metadata.modification_date else "Unknown",
            "page_dimensions": [],
            "has_toc": len(doc.get_toc()) > 0,
            "has_links": any(len(page.get_links()) > 0 for page in doc),
            "has_forms": any(page.widgets() for page in doc)
        }
        
        # Add page dimensions
        for page in doc:
            metadata["page_dimensions"].append({
                "width": page.rect.width,
                "height": page.rect.height
            })
        
        return metadata
        
    except Exception as e:
        print(f"Error extracting PDF metadata: {str(e)}")
        return {
            "file_name": os.path.basename(file_path),
            "error": str(e)
        }

def save_enhanced_pdf_extraction(file_path, filename):
    """Save comprehensive PDF information including text, formulas as images, and embedded images."""
    try:
        # Extract all the different components
        text_data = extract_text_from_pdf(file_path)
        formula_data = extract_formulas_from_pdf(file_path)
        image_data = extract_images_from_pdf(file_path)
        metadata = extract_pdf_metadata(file_path)
        
        # Update metadata to indicate if mathematical content was found
        metadata["has_mathematical_content"] = any(slide.get("has_math_content", False) for slide in text_data)
        
        # Combine into a comprehensive structure
        pdf_data = {
            "filename": filename,
            "total_pages": len(text_data),
            "extraction_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "metadata": metadata,
            "slides": text_data,  # Keep the slide terminology for consistency
            "formulas": formula_data,
            "images": image_data,
            "original_file_path": file_path  # Store the path to the original file
        }
        
        # Save to JSON file
        json_path = f'slides/{filename}_enhanced.json'
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(pdf_data, f, indent=2)
        
        return pdf_data
        
    except Exception as e:
        print(f"Error in enhanced PDF extraction: {str(e)}")
        return None

def save_extracted_pdf_text(slide_data, filename):
    """Save extracted PDF text to a JSON file (original function for backward compatibility)."""
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