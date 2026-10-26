from datetime import datetime,timezone
from sqlalchemy import Column,Integer,String,Float,Text,DateTime
from .database import Base
class Hazard(Base):
 __tablename__='hazards'
 id=Column(Integer,primary_key=True,index=True)
 reference=Column(String(32),unique=True,index=True,nullable=False)
 type=Column(String(50),nullable=False,index=True)
 location=Column(String(300),nullable=False)
 description=Column(Text,nullable=False)
 latitude=Column(Float,nullable=True,index=True)
 longitude=Column(Float,nullable=True,index=True)
 severity=Column(String(20),default='medium',nullable=False)
 status=Column(String(30),default='submitted',nullable=False,index=True)
 image_path=Column(String(500),nullable=True)
 created_at=Column(DateTime,default=lambda:datetime.now(timezone.utc),nullable=False)
