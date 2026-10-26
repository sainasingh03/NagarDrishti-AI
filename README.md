# NagarDrishti AI — Road Hazard Awareness

A React/Vite + FastAPI + SQLite application for community road-hazard reporting, map visualization, route handoff, proximity alerts, complaint-letter preparation, and optional real hosted computer-vision inference.

## What is real and what needs configuration?

- **Real persistence:** reports are stored in the local database; uploaded photos are saved on disk.
- **Real map:** Leaflet uses map tiles and displays records returned by the API. OpenStreetMap does not provide comprehensive pothole data; the map shows reports collected by this app.
- **Real trained-model inference:** `/api/detection/analyze` calls a hosted Roboflow model when `ROBOFLOW_API_KEY` is configured. Default model ID is `new-pothole-detection/1`; see its model page for dataset, classes, license and limitations: https://universe.roboflow.com/smartathon/new-pothole-detection. Provider availability, terms and API limits apply. This ZIP does **not** contain the model weights and does not train a model locally.
- **Routes:** Google Maps opens directions externally. The app does not insert its private hazard reports into Google Maps or guarantee Google will avoid potholes.
- **Government:** the app links to the official portals; it does not submit complaints automatically or claim government integration.
- **Alerts:** proximity alerts are based on reports saved in this app and browser location permissions. They cannot detect every road hazard.

## Windows setup

### 1. Configure the hosted AI (optional but required for real model predictions)

Copy `.env.example` to `.env` in the project root. Add your Roboflow API key to `ROBOFLOW_API_KEY`. Never put this key in frontend code, commit it, or share it publicly. You can run reports, map and complaint draft features without the key, but the AI endpoint will clearly report that inference is not configured.

### 2. Start the backend

From the project root in PowerShell:

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8081 --reload
```

If using `.env`, install `python-dotenv`; add `from dotenv import load_dotenv; load_dotenv()` at the top of `backend/main.py` before modules read environment variables, or set environment variables in PowerShell before launching. (For example: `$env:ROBOFLOW_API_KEY='your-key'`.)

API docs: http://127.0.0.1:8081/docs
Health: http://127.0.0.1:8081/api/health

### 3. Start the frontend in a second terminal

```powershell
npm install
npm run dev
```

Open the local Vite URL printed in the terminal, usually http://localhost:5173.

## AI endpoint

POST `/api/detection/analyze` as multipart form data with field name `image` (JPG, PNG, WebP; maximum 8 MB). The response includes `model_available`, `model_name`, `detections`, and an honest status message. Each detection may include class, confidence, and bounding-box center/size. Confidence is not a guarantee; users should review predictions.

## Official resources

- Kanpur Nagar Nigam: https://kmc.up.nic.in/
- UP Jansunwai: https://jansunwai.up.nic.in/
- UP PWD: https://uppwd.gov.in/

Complaint generation prepares a draft for the user to submit through the official process. The app cannot confirm receipt unless the authority itself provides an acknowledgement.

## Safety and privacy

This is not a certified navigation or emergency system. Reports may be missing, stale or inaccurate. Do not interact with the screen while driving. Use alerts only with permission and test audio while stationary. Do not assume a route is safe because no hazard is reported. Uploaded images and coordinates can contain sensitive information; deploy with appropriate access controls, retention rules, HTTPS and secure storage before public release.

## Storytelling dashboard update
The dashboard now includes an editorial road-safety story flow, separate **Road Stories** and **Daily Awareness** pages, rotating photo backgrounds (every 6.5 seconds), rotating daily reminders/quotes, animated chapter cards and GSAP ScrollTrigger reveals. The awareness content is educational copy, not live official safety advisories. Photos load from Unsplash and require internet access. GSAP is a frontend dependency; run `npm install` after extracting the project.

## Storytelling dashboard photography
The dashboard hero rotates between two real landscape photographs hosted by Unsplash, rather than generated-looking illustrations. It intentionally uses **one large hero photograph at a time**; the three story chapters use quiet botanical colour panels instead of stacking more stock photos.

Photo sources / photographer pages:
- Claudio Schwarz, “empty road during golden hour”: https://unsplash.com/photos/empty-road-during-golden-hour-GxSTPd0dF3I
- Gaurav Rawat, “a scenic view of a mountain with a winding road” (Rohru, Himachal Pradesh, India): https://unsplash.com/photos/a-scenic-view-of-a-mountain-with-a-winding-road-sgLcr5C81T0

The photo carousel requires internet access. The images are linked from Unsplash; they are not bundled into the ZIP. If you need fully offline assets, download the images from their source pages and save them under `public/images/`, then update `imgs` near the top of `src/App.jsx` to use `/images/filename.jpg`.
