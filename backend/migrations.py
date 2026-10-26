"""Small additive startup migrations for the local prototype schema.

The migration is intentionally non-destructive: existing reports are retained
and receive `unrated` severity because older rows never recorded a severity.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def upgrade_existing_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "road_reports" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("road_reports")}
    if "severity" not in columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE road_reports ADD COLUMN severity VARCHAR(16) NOT NULL DEFAULT 'unrated'"
            ))
