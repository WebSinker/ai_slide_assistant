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
    """Detect potential mathematical content in text with special handling for title pages."""
    # First, check if this is just a chapter or contents page
    if re.match(r'^Chapter \d+', text.strip()):
        # Count the number of lines with section numbers (like 3.1, 3.2, etc.)
        section_pattern = re.compile(r'^\d+\.\d+\s+[A-Za-z]', re.MULTILINE)
        section_matches = section_pattern.findall(text)
        
        # If we have multiple section headers and no equations, it's likely just a contents page
        if len(section_matches) >= 3 and not re.search(r'[=λθ]', text):
            print(f"Detected chapter contents page with {len(section_matches)} sections")
            return False
    
    # Common math symbols and patterns that strongly indicate math content
    strong_math_indicators = [
        r'[=+\-*/^√∫∑∏πλθ]',                # Basic math operators and symbols
        r'\\frac',                          # LaTeX fractions
        r'\\sin|\\cos|\\tan',               # Trigonometric functions
        r'\$.*?\$',                         # LaTeX inline mode
        r'\$\$.*?\$\$',                     # LaTeX display mode
        r'λ|θ|σ|μ|α|β|γ',                   # Greek letters (strong indicators)
        r'[0-9]+\s*[+\-*/]\s*[0-9]+',       # Basic arithmetic
        r'[a-zA-Z]\s*=\s*[0-9a-zA-Z]',      # Equations with variables
        r'[a-zA-Z]\^[0-9]',                 # Powers (x^2)
        r'd_{hkl}',                         # Subscripts in specific math context
        r'sin\s*[θ]',                       # Trigonometric expressions
        r'sin\s*θ',                         # Explicit sin theta
        r'[0-9]+\s*sin\s*\w',               # Numerical trig expressions
        r'OR\s*=',                          # Specific equations from your content
    ]
    
    # Patterns that might indicate math content in context
    context_dependent_indicators = [
        r'Ewald\s+construction',            # Ewald construction reference
    ]
    
    # Weaker patterns that might indicate math content but need verification
    weak_math_indicators = [
        r'\([0-9]+\)',                      # Numbers in parentheses
        r'[A-Z]\s*is',                      # Definitions of variables
        r'vector',                          # Mentions of vectors
    ]
    
    # Check for strong math indicators - these are very likely to be math
    for pattern in strong_math_indicators:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    
    # Count the occurrences of potential math symbols
    symbol_count = len(re.findall(r'[=+\-*/^√∫∑∏πλθ]', text))
    
    # If there are many symbols in a relatively short text, it's likely math
    if symbol_count > 3 and len(text) < 500:
        return True
    
    # More specific patterns for formulas in your X-ray diffraction content
    if ('Sin' in text or 'sin' in text) and ('θ' in text or '2θ' in text):
        return True
    
    if 'λ' in text and 'd' in text:
        return True
    
    # Special check for Ewald construction - need both the term AND some math content
    if 'Ewald' in text and any(term in text for term in ['sphere', 'construction', 'reciprocal']):
        # Only count this as math if there are also equations or symbols
        # This prevents a chapter title like "3.2 Ewald construction" from being detected as math
        if symbol_count > 0 and ('=' in text or 'λ' in text or 'θ' in text):
            return True
        
        # If it's just a section title with Ewald construction, check if it's longer than a title
        # and contains actual mathematical explanation
        line_count = len(text.strip().split('\n'))
        if line_count > 5 and symbol_count > 0:
            return True
        
        # Otherwise, it's likely just a title or heading with "Ewald construction"
        if line_count < 5 and not '=' in text:
            return False
    
    # Context-dependent check: for terms that might indicate math when combined with symbols
    for pattern in context_dependent_indicators:
        if re.search(pattern, text, re.IGNORECASE):
            # Only count as math if we also have some math symbols
            if symbol_count > 0:
                return True
    
    # Check specific terms related to X-ray diffraction
    xray_terms = ['diffract', 'lattice', 'crystal', 'X-ray', 'Bragg', 'reflection']
    if any(term in text for term in xray_terms) and symbol_count > 1:
        return True
    
    # Look for patterns of variable definitions common in your content
    var_definitions = re.findall(r'([A-Z])\s+is\s+(the|a)\s+([a-z]+\s*[a-z]*)', text)
    if len(var_definitions) >= 2:  # Multiple variable definitions suggest math content
        return True
    
    # For weak indicators, require multiple matches to trigger
    weak_indicator_count = sum(1 for pattern in weak_math_indicators if re.search(pattern, text))
    if weak_indicator_count >= 2 and symbol_count >= 1:
        return True
    
    return False

def analyze_math_content_in_pdf(file_path):
    """
    Utility function to analyze PDF pages for mathematical content.
    Helps diagnose false positives and negatives in math content detection.
    """
    try:
        # Open the PDF with PyMuPDF
        doc = fitz.open(file_path)
        results = []
        
        print(f"Analyzing {file_path} for math content...")
        print(f"Total pages: {len(doc)}")
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            
            # Try different detection methods
            main_detection = detect_math_content(page_text)
            
            # Count math symbols
            math_symbols = r'[=+\-*/^√∫∑∏πλθ]'
            symbol_count = len(re.findall(math_symbols, page_text))
            
            # Look for Greek letters separately
            greek_letters = r'[αβγδεζηθικλμνξοπρστυφχψω]'
            greek_count = len(re.findall(greek_letters, page_text))
            
            # Look for equation patterns
            eq_patterns = r'[a-zA-Z]\s*=\s*[a-zA-Z0-9]'
            equation_count = len(re.findall(eq_patterns, page_text))
            
            # Check for specific formula patterns like λ = 2d Sin θ
            specific_formulas = any(re.search(r'λ\s*=\s*2d\s*Sin', page_text, re.IGNORECASE))
            
            # Get the first few lines to check if it's a title page
            first_lines = '\n'.join(page_text.split('\n')[:5])
            is_title_page = bool(re.match(r'^Chapter|^\d+\.\d+\s+[A-Z]', first_lines))
            
            # Examine blocks for potential formulas
            blocks = page.get_text("dict")["blocks"]
            block_math_count = 0
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        line_text = "".join([span["text"] for span in line["spans"]])
                        if detect_math_content(line_text):
                            block_math_count += 1
            
            # Compile the results
            page_result = {
                "page_number": page_num + 1,
                "math_detected": main_detection,
                "symbol_count": symbol_count,
                "greek_letter_count": greek_count,
                "equation_count": equation_count,
                "specific_formulas_found": specific_formulas,
                "is_title_page": is_title_page,
                "block_math_count": block_math_count,
                "first_lines": first_lines,
                "likely_has_math": (symbol_count > 3) or (greek_count > 0) or (equation_count > 0) or specific_formulas or (block_math_count > 1)
            }
            
            results.append(page_result)
            
            # Print a summary
            print(f"\nPage {page_num + 1}:")
            print(f"  Math detected: {main_detection}")
            print(f"  Symbol count: {symbol_count}")
            print(f"  Greek letters: {greek_count}")
            print(f"  Equations: {equation_count}")
            print(f"  Block math count: {block_math_count}")
            print(f"  First lines: {first_lines[:100]}...")
            print(f"  CONCLUSION: {'MATH CONTENT' if page_result['likely_has_math'] else 'NO MATH CONTENT'}")
        
        return results
    
    except Exception as e:
        print(f"Error analyzing math content: {str(e)}")
        return []

def capture_page_images_with_formulas(file_path, slides):
    """Capture images of pages that contain mathematical formulas with improved detection."""
    try:
        # Open the PDF with PyMuPDF
        doc = fitz.open(file_path)
        
        for i, slide in enumerate(slides):
            page_num = slide["slide_number"] - 1  # 0-based page index
            
            if page_num >= len(doc):
                print(f"Warning: Page {page_num + 1} requested but document only has {len(doc)} pages")
                continue
                
            # Get the page text with better formatting preservation
            page = doc[page_num]
            page_text = page.get_text()
            
            # Enhanced check for mathematical content
            has_math = detect_math_content(page_text)
            
            # Double-check with visual inspection for common math symbols
            visual_math_check = bool(re.search(r'[=+\-*/^√∫∑∏πλθ]|sin|cos|θ|λ|\d+/\d+', page_text))
            
            # Additional check for formulas in blocks
            blocks = page.get_text("dict")["blocks"]
            block_math_found = False
            for block in blocks:
                if "lines" in block:
                    for line in block["lines"]:
                        line_text = "".join([span["text"] for span in line["spans"]])
                        if detect_math_content(line_text):
                            block_math_found = True
                            break
                if block_math_found:
                    break
            
            # Mark the slide as containing math based on combined checks
            slide["has_math_content"] = has_math or visual_math_check or block_math_found
            
            # Debug output to help diagnose issues
            print(f"Page {page_num + 1} math content detection:")
            print(f"  - Basic math detection: {has_math}")
            print(f"  - Visual symbol check: {visual_math_check}")
            print(f"  - Block-level check: {block_math_found}")
            print(f"  - Final decision: {slide['has_math_content']}")
            
            # If it has math content, capture an image of the entire page
            if slide["has_math_content"] and page_num < len(doc):
                try:
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
    """Save comprehensive PDF information with improved math formula detection."""
    try:
        print(f"Starting enhanced extraction for {filename}...")
        
        # Extract text data first
        text_data = extract_text_from_pdf(file_path)
        if not text_data:
            print(f"Failed to extract text from {filename}")
            return None
            
        print(f"Extracted text from {len(text_data)} pages")
        
        # Count pages with detected math content
        math_pages = [slide for slide in text_data if slide.get("has_math_content", False)]
        print(f"Initially detected {len(math_pages)} pages with math content")
        
        # Extract formulas with improved detection
        formula_data = extract_formulas_from_pdf(file_path)
        print(f"Extracted {len(formula_data)} potential formulas")
        
        # Extract images
        image_data = extract_images_from_pdf(file_path)
        print(f"Extracted {len(image_data)} images")
        
        # Extract metadata
        metadata = extract_pdf_metadata(file_path)
        
        # Verify math content detection based on formula extraction
        # If formulas were found but no pages were marked as having math, fix it
        if len(formula_data) > 0 and len(math_pages) == 0:
            print("Warning: Formulas detected but no pages marked as having math content")
            
            # Find which pages have formulas
            formula_page_numbers = set([formula["page"] for formula in formula_data])
            print(f"Formulas found on pages: {formula_page_numbers}")
            
            # Mark those pages as having math content
            for slide in text_data:
                if slide["slide_number"] in formula_page_numbers:
                    slide["has_math_content"] = True
                    print(f"Marking page {slide['slide_number']} as having math content based on formula detection")
                    
                    # Make sure we capture the page image if not already done
                    if not slide.get("page_image"):
                        try:
                            doc = fitz.open(file_path)
                            page = doc[slide["slide_number"] - 1]
                            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                            img_data = pix.tobytes("png")
                            img_b64 = base64.b64encode(img_data).decode('utf-8')
                            slide["page_image"] = f"data:image/png;base64,{img_b64}"
                            print(f"Captured missing image for page {slide['slide_number']} with math content")
                        except Exception as e:
                            print(f"Error capturing page image: {e}")
        
        # Double check title pages - they should not be marked as having math content
        # unless they actually contain equations
        for slide in text_data:
            page_num = slide["slide_number"]
            if slide.get("has_math_content", False):
                # Check if this is just a title page with no actual math
                title_text = slide.get("title", "").lower()
                content_text = slide.get("text", "")
                
                is_just_title = (
                    ("chapter" in title_text or "section" in title_text) and
                    len(content_text.split('\n')) < 10 and
                    not any(sym in content_text for sym in "=+-*/^λθ")
                )
                
                if is_just_title:
                    slide["has_math_content"] = False
                    print(f"Unmarking page {page_num} as it appears to be just a title page")
        
        # Re-count pages with math content after corrections
        math_pages = [slide for slide in text_data if slide.get("has_math_content", False)]
        print(f"After corrections: {len(math_pages)} pages with math content")
        
        # Update metadata to indicate if mathematical content was found
        metadata["has_mathematical_content"] = len(math_pages) > 0
        
        # Combine into a comprehensive structure
        pdf_data = {
            "filename": filename,
            "total_pages": len(text_data),
            "extraction_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "metadata": metadata,
            "slides": text_data,
            "formulas": formula_data,
            "images": image_data,
            "original_file_path": file_path,
            "math_content_pages": [slide["slide_number"] for slide in math_pages]
        }
        
        # Save to JSON file
        json_path = f'slides/{filename}_enhanced.json'
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(pdf_data, f, indent=2)
        
        print(f"Enhanced extraction completed and saved to {json_path}")
        return pdf_data
        
    except Exception as e:
        print(f"Error in enhanced PDF extraction: {str(e)}")
        import traceback
        traceback.print_exc()
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