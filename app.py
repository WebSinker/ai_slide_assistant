from flask import Flask, request, jsonify, send_from_directory
from pptx import Presentation
from dotenv import load_dotenv
from google import genai
import subprocess
import os
import json
import time
import re
from pdf_processor import extract_text_from_pdf, save_extracted_pdf_text

# Load environment variables
load_dotenv()

app = Flask(__name__)
UPLOAD_FOLDER = 'slides'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configure Gemini AI
os.environ["API_KEY"] = os.getenv("API_KEY")  # Ensure API_KEY is set in your .env file
client = genai.Client(api_key=os.environ["API_KEY"])

model = "gemini-2.0-flash"

def extract_text_from_pptx(file_path):
    prs = Presentation(file_path)
    slides = []

    for idx, slide in enumerate(prs.slides, start=1):
        slide_data = {
            "slide_number": idx,
            "title": "",
            "content": [],
            "notes": "",
            "text": ""
        }
        
        # First pass: extract the title if it exists
        for shape in slide.shapes:
            try:
                if hasattr(shape, 'text') and shape.text.strip():
                    if hasattr(shape, 'is_placeholder') and shape.is_placeholder:
                        if shape.placeholder_format.type == 1:  # Title placeholder
                            slide_data["title"] = shape.text.strip()
                            break  # Found the title, exit the loop
            except AttributeError:
                continue
        
        # Second pass: extract all content including the title
        for shape in slide.shapes:
            try:
                if hasattr(shape, 'text') and shape.text.strip():
                    # Add all text content
                    slide_data["content"].append(shape.text.strip())
            except AttributeError:
                if hasattr(shape, 'text') and shape.text.strip():
                    slide_data["content"].append(shape.text.strip())
        
        # Get slide notes if they exist
        try:
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame.text.strip():
                slide_data["notes"] = slide.notes_slide.notes_text_frame.text.strip()
        except AttributeError:
            pass

        # Combine all text with title at the beginning
        slide_data["text"] = (
            (slide_data["title"] + "\n" if slide_data["title"] else "") +
            "\n".join(slide_data["content"])
        ).strip()

        slides.append(slide_data)

    return slides

def convert_ppt_to_pptx(ppt_path):
    try:
        # Full path to soffice.exe (change this if needed)
        soffice_path = r"C:\Program Files\LibreOffice\program\soffice.exe"
        
        # Run the command and print the output for debugging
        result = subprocess.run([
            soffice_path, '--headless', '--convert-to', 'pptx',
            ppt_path, '--outdir', os.path.dirname(ppt_path)
        ], check=True, capture_output=True, text=True)
        
        # Print the output for debugging
        print("Conversion output:", result.stdout)
        print("Conversion error:", result.stderr)
        
        pptx_path = ppt_path.rsplit('.', 1)[0] + '.pptx'
        
        if os.path.exists(pptx_path):
            return pptx_path
        return None
    except Exception as e:
        print("Conversion failed:", e)
        return None

def save_extracted_text(slide_data, filename):
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
        
# Update the call_gemini function to always consider all slides by default
def call_gemini(question, context, slide_number=None):
    try:
        slides = context.get("slides", [])

        if slide_number is not None:
            # If a specific slide is selected, only use that slide's content
            context_text = next((slide["text"] for slide in slides if slide["slide_number"] == slide_number), "")
            scope_notice = f"Answer based on content from Slide {slide_number}:"
        else:
            # If no specific slide is selected, use all slides' content
            context_text = "\n\n".join([f"Slide {slide['slide_number']}:\n{slide['text']}" for slide in slides])
            scope_notice = "Answer based on content from all slides:"

        prompt = f"""As an AI tutor, please answer this question based on the slide content:

{scope_notice}
{context_text}

Question: {question}

Important formatting guidelines:
1. Do not use asterisks (*) for emphasis. Use HTML tags like <strong> or <em> instead.
2. When referencing individual slides, use the format "Slide X" (not "slide X").
3. When referencing a range of slides, use the format "Slides X-Y" (like "Slides 10-13").
4. Format any lists as proper HTML lists with <ul> and <li> tags.
5. Present your answer in clear, well-formatted paragraphs with proper spacing."""

        response = client.models.generate_content(
            model=model,
            contents=prompt
        )

        processed_text = response.text
        
        # Replace any remaining asterisks for emphasis
        processed_text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', processed_text)
        processed_text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', processed_text)
        
        # Process multiple patterns for slide ranges with different formats
        
        # Pattern: "Slides X-Y" (like "Slides 8-18" or "Slides 10-13")
        processed_text = re.sub(
            r'Slides (\d+)-(\d+)', 
            r'<a href="#slide-range" data-range="\1-\2">Slides \1-\2</a>', 
            processed_text
        )
        
        # Pattern: "Slide X to Y" (handle another possible format)
        processed_text = re.sub(
            r'Slide (\d+) to (\d+)', 
            r'<a href="#slide-range" data-range="\1-\2">Slides \1 to \2</a>', 
            processed_text
        )
        
        # Pattern: "Slides X and Y" (not a range, but individual slides)
        processed_text = re.sub(
            r'Slides (\d+) and (\d+)(?!\d)', 
            r'<a href="#slide-\1">Slide \1</a> and <a href="#slide-\2">Slide \2</a>', 
            processed_text
        )
        
        # Handle capitalization variations like "slide" instead of "Slide"
        processed_text = re.sub(
            r'slide (\d+)', 
            r'<a href="#slide-\1">Slide \1</a>', 
            processed_text,
            flags=re.IGNORECASE
        )

        # Process individual slide references - must come last
        processed_text = re.sub(
            r'Slide (\d+)', 
            r'<a href="#slide-\1">Slide \1</a>', 
            processed_text
        )
        
        return processed_text

    except Exception as e:
        print(f"Gemini API error: {str(e)}")
        return f"Error: Failed to get response from Gemini. {str(e)}"

# Update the ask_question route to handle presentation-specific queries
@app.route('/ask', methods=['POST'])
def ask_question():
    data = request.json
    question = data.get("question")
    slide_num = data.get("slide_number")  # This can be None if no specific slide is selected
    filename = data.get("filename")

    try:
        # Check if the file exists first
        file_path = f'slides/{filename}_slides.json'
        if not os.path.exists(file_path):
            return jsonify({"error": f"Presentation '{filename}' not found"}), 404
            
        # Load the single JSON file containing all slides for this presentation
        with open(file_path, 'r', encoding='utf-8') as f:
            presentation_data = json.load(f)

        # Call Gemini with the presentation data
        response = call_gemini(question, presentation_data, slide_num)

        return jsonify({
            "question": question,
            "answer": response,
            "source_presentation": filename
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_slide():
    try:
        # Accept multiple files
        uploaded_files = request.files.getlist('files[]')
        
        if not uploaded_files:
            return jsonify({"error": "No files uploaded"}), 400
        
        presentations = []

        for file in uploaded_files:
            if file.filename == '':
                continue  # Skip empty file inputs

            # Verify file extension - now include PDF
            if not file.filename.lower().endswith(('.ppt', '.pptx', '.pdf')):
                continue  # Skip invalid files

            # Save file
            save_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(save_path)

            # Process based on file type
            if file.filename.lower().endswith('.pdf'):
                # Process PDF file
                slides = extract_text_from_pdf(save_path)
                if not slides:
                    continue  # Skip if extraction fails
                    
                # Save extracted text to JSON
                filename = file.filename.rsplit('.', 1)[0]
                save_extracted_pdf_text(slides, filename)
                
            elif file.filename.lower().endswith('.ppt'):
                # Convert .ppt to .pptx if needed
                converted_path = convert_ppt_to_pptx(save_path)
                if not converted_path:
                    continue  # Skip if conversion fails
                save_path = converted_path
                
                # Extract text from PowerPoint
                slides = extract_text_from_pptx(save_path)
                
                # Save extracted text to JSON
                save_extracted_text(slides, file.filename.rsplit('.', 1)[0])
                
            else:  # .pptx file
                # Extract text from PowerPoint
                slides = extract_text_from_pptx(save_path)
                
                # Save extracted text to JSON
                save_extracted_text(slides, file.filename.rsplit('.', 1)[0])

            # Store this presentation's data
            presentations.append({
                "filename": file.filename,
                "slides": slides
            })

        if not presentations:
            return jsonify({"error": "No valid presentations uploaded"}), 400

        return jsonify({"presentations": presentations})

    except Exception as e:
        print(f"Error in upload_slide: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

if __name__ == '__main__':
    app.run(debug=True)
    