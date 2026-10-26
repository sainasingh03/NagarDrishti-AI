"""Image validation/storage and optional real hosted Roboflow inference.

No predictions are fabricated. Configure ROBOFLOW_API_KEY and a model ID
for real detections. The model runs on Roboflow's hosted inference service.
"""
import os, base64
from pathlib import Path
from uuid import uuid4
from io import BytesIO
import requests
from fastapi import UploadFile, HTTPException
from PIL import Image

UPLOAD = Path(os.getenv('NAGARDRISHTI_UPLOAD_DIR', 'uploads'))
UPLOAD.mkdir(parents=True, exist_ok=True)
MAX_BYTES = 8 * 1024 * 1024
ALLOWED = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}

async def save_image(file: UploadFile):
    if file.content_type not in ALLOWED:
        raise HTTPException(400, 'Use JPG, PNG, or WebP.')
    data = await file.read()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(400, 'Image is empty or exceeds 8 MB.')
    try:
        image = Image.open(BytesIO(data))
        image.verify()
    except Exception:
        raise HTTPException(400, 'Invalid image file.')
    name = uuid4().hex + ALLOWED[file.content_type]
    (UPLOAD / name).write_bytes(data)
    return str(UPLOAD / name)

async def analyze(file: UploadFile):
    path = await save_image(file)
    model_id = os.getenv('ROBOFLOW_MODEL_ID', 'new-pothole-detection/1').strip()
    api_key = os.getenv('ROBOFLOW_API_KEY', '').strip()
    if not api_key:
        return {
            'model_available': False, 'model_name': model_id, 'detections': [],
            'saved_image': Path(path).name, 'image_url': '/uploads/' + Path(path).name,
            'message': 'Image saved. Real trained-model inference is not enabled yet: set ROBOFLOW_API_KEY in .env and restart the backend. No predictions were fabricated.'
        }
    try:
        raw = Path(path).read_bytes()
        encoded = base64.b64encode(raw).decode('ascii')
        endpoint = f'https://serverless.roboflow.com/{model_id}'
        response = requests.post(endpoint, params={'api_key': api_key}, data=encoded,
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=45)
        response.raise_for_status()
        payload = response.json()
        predictions = payload.get('predictions', [])
        detections = []
        for p in predictions:
            detections.append({
                'class': str(p.get('class', 'unknown')),
                'confidence': round(float(p.get('confidence', 0)), 4),
                'x': p.get('x'), 'y': p.get('y'), 'width': p.get('width'), 'height': p.get('height')
            })
        return {
            'model_available': True, 'model_name': model_id, 'detections': detections,
            'saved_image': Path(path).name, 'image_url': '/uploads/' + Path(path).name,
            'image_dimensions': payload.get('image'),
            'message': 'Inference completed using a hosted trained model. Predictions are advisory and require human review; a missed detection does not mean the road is safe.'
        }
    except requests.RequestException as exc:
        detail = 'Hosted model request failed. Check internet access, model ID, API key, and provider limits.'
        if getattr(exc, 'response', None) is not None and exc.response is not None:
            detail += f' Provider HTTP status: {exc.response.status_code}.'
        return {'model_available': False, 'model_name': model_id, 'detections': [],
                'saved_image': Path(path).name, 'image_url': '/uploads/' + Path(path).name,
                'message': detail}
    except (ValueError, TypeError) as exc:
        return {'model_available': False, 'model_name': model_id, 'detections': [],
                'saved_image': Path(path).name, 'image_url': '/uploads/' + Path(path).name,
                'message': 'The model response could not be interpreted. No predictions were fabricated.'}
