from dotenv import load_dotenv
load_dotenv()
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI,Depends,Form,File,UploadFile,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import desc,text
from .database import Base,engine,get_db
from .models import Hazard
from .vision import save_image,analyze
Base.metadata.create_all(bind=engine)
app=FastAPI(title='NagarDrishti AI API',version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173','http://127.0.0.1:5173'],allow_methods=['*'],allow_headers=['*'])
UPLOAD=Path('uploads');UPLOAD.mkdir(exist_ok=True)
app.mount('/uploads',StaticFiles(directory=str(UPLOAD)),name='uploads')
def out(h):return {'id':h.id,'reference':h.reference,'type':h.type,'location':h.location,'description':h.description,'latitude':h.latitude,'longitude':h.longitude,'severity':h.severity,'status':h.status,'image_url':'/uploads/'+Path(h.image_path).name if h.image_path else None,'created_at':h.created_at.isoformat() if h.created_at else None}
@app.get('/')
def root():return {'name':'NagarDrishti AI API','docs':'/docs'}
@app.get('/api/health')
def health(db:Session=Depends(get_db)):
 db.execute(text('SELECT 1'));return {'status':'ok','database':'connected'}
@app.get('/api/hazards')
def list_hazards(limit:int=200,db:Session=Depends(get_db)):
 return [out(h) for h in db.query(Hazard).order_by(desc(Hazard.created_at)).limit(max(1,min(limit,500))).all()]
@app.get('/api/hazards/{hid}')
def get_hazard(hid:int,db:Session=Depends(get_db)):
 h=db.query(Hazard).filter(Hazard.id==hid).first()
 if not h:raise HTTPException(404,'Report not found')
 return out(h)
@app.post('/api/hazards')
async def create(type:str=Form(...),location:str=Form(...),description:str=Form(...),latitude:str=Form(''),longitude:str=Form(''),severity:str=Form('medium'),image:UploadFile|None=File(None),db:Session=Depends(get_db)):
 if type not in {'pothole','road_crack','damaged_surface','waterlogging','drainage','other'}:raise HTTPException(422,'Invalid hazard type')
 if severity not in {'low','medium','high'}:raise HTTPException(422,'Invalid severity')
 if not location.strip() or not description.strip():raise HTTPException(422,'Location and description required')
 def coord(v,lo,hi,name):
  if not v.strip():return None
  try:n=float(v)
  except ValueError:raise HTTPException(422,name+' must be numeric')
  if not lo<=n<=hi:raise HTTPException(422,name+' out of range')
  return n
 path=await save_image(image) if image and image.filename else None
 h=Hazard(reference='ND-'+uuid4().hex[:8].upper(),type=type,location=location.strip()[:300],description=description.strip()[:5000],latitude=coord(latitude,-90,90,'Latitude'),longitude=coord(longitude,-180,180,'Longitude'),severity=severity,status='submitted',image_path=path)
 db.add(h);db.commit();db.refresh(h);return out(h)
@app.post('/api/detection/analyze')
async def detect(image:UploadFile=File(...)):return await analyze(image)
@app.get('/api/government/portals')
def portals():return [{'name':'Kanpur Nagar Nigam','url':'https://kmc.up.nic.in/'},{'name':'UP Jansunwai','url':'https://jansunwai.up.nic.in/'},{'name':'UP PWD','url':'https://uppwd.gov.in/'}]
@app.post('/api/routes/analyze')
def route_analyze(payload:dict,db:Session=Depends(get_db)):
 if not isinstance(payload.get('coordinates'),list) or not payload['coordinates']:raise HTTPException(422,'Provide coordinates from a real routing provider')
 return {'hazards':[out(h) for h in db.query(Hazard).filter(Hazard.latitude.isnot(None),Hazard.longitude.isnot(None)).all()],'message':'Hazard records returned; this endpoint does not calculate route geometry.'}
