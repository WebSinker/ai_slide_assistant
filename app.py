from flask import Flask, request, jsonify, send_from_directory
from pptx import Presentation
from dotenv import load_dotenv
from google import genai
import subprocess
import os
import json
import time

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
        
        for shape in slide.shapes:
            try:
                if hasattr(shape, 'text') and shape.text.strip():
                    # Check for title placeholder
                    if hasattr(shape, 'is_placeholder') and shape.is_placeholder:
                        if shape.placeholder_format.type == 1:
                            slide_data["title"] = shape.text.strip()
                        else:
                            slide_data["content"].append(shape.text.strip())
                    else:
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

        # Combine all text
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
    with open(f'slides/{filename}_slides.json', 'w', encoding='utf-8') as f:
        json.dump(slide_data, f, indent=2)
        
def call_gemini(question, context, slide_number=None):
    try:
        if slide_number is not None:
            context_text = next((slide["text"] for slide in context if slide["slide_number"] == slide_number), "")
        else:
            context_text = "\n\n".join(slide["text"] for slide in context)

        prompt = f"""As an AI tutor, please answer this question based on the slide content:

Context from slides:
{context_text}

Question: {question}"""

        response = client.models.generate_content(
            model=model,
            contents=prompt
        )
        return response.text  # Use `response.text` to get the generated content

    except Exception as e:
        print(f"Gemini API error: {str(e)}")
        return f"Error: Failed to get response from Gemini. {str(e)}"

@app.route('/upload', methods=['POST'])
def upload_slide():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "Empty filename"}), 400

        # Verify file extension
        if not file.filename.lower().endswith(('.ppt', '.pptx')):
            return jsonify({"error": "Invalid file format. Only .ppt and .pptx files are allowed"}), 400

        # Save file
        save_path = os.path.join(UPLOAD_FOLDER, file.filename)
        file.save(save_path)

        # Convert .ppt to .pptx if necessary
        if file.filename.lower().endswith('.ppt'):
            converted_path = convert_ppt_to_pptx(save_path)
            if not converted_path:
                return jsonify({"error": "Failed to convert .ppt to .pptx"}), 500
            save_path = converted_path

        # Extract text
        text = extract_text_from_pptx(save_path)
        
        # Save extracted text to JSON file
        save_extracted_text(text, file.filename.rsplit('.', 1)[0])
        
        return jsonify({
            "message": "File uploaded and text extracted",
            "filename": file.filename,
            "slides": text
        })

    except Exception as e:
        # Log the error for debugging
        print(f"Error in upload_slide: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/ask', methods=['POST'])
def ask_question():
    data = request.json
    question = data.get("question")
    slide_num = data.get("slide_number")
    filename = data.get("filename")

    try:
        with open(f'slides/{filename}_slides.json', 'r', encoding='utf-8') as f:
            slides = json.load(f)

        # Call Gemini instead of OpenAI
        response = call_gemini(question, slides, slide_num)

        return jsonify({
            "question": question,
            "answer": response
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

if __name__ == '__main__':
    app.run(debug=True)
