"""Tests for client contact sheet import."""

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, Client, TeamMember
from app.db.session import reset_engine_for_tests
from app.services.pm_client_import import import_clients_from_contact_sheet, parse_client_contact_sheet


@pytest.fixture()
def pm_session():
    reset_engine_for_tests()
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    session.add(TeamMember(name="Sunil", role="researcher"))
    session.add(Client(client_name="Aargee Equipments Pvt Ltd"))
    session.commit()
    try:
        yield session
        session.commit()
    finally:
        session.close()
        engine.dispose()
        reset_engine_for_tests()


def test_parse_client_contact_sheet():
    import pandas as pd
    import io

    df = pd.DataFrame(
        [
            {
                "Customer Id": "Et-001",
                "Billing Name": "Acme Ltd",
                "Address": "123 Street",
                "Gst Number": "GST123",
                "State": "Karnataka",
                "Contact 1 Name": "Jane",
                "Contact 1 Number": "9999999999",
                "Contact 1 Email Id": "jane@acme.com",
                "Contact 2 Name": "",
                "Contact 2 Number": "",
                "Contact 2 Email Id": "",
                "Contact 3 Name": "",
                "Contact 3 Number": "",
                "Contact 3 Email Id": "",
            }
        ]
    )
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    rows = parse_client_contact_sheet(buf.getvalue(), filename="clients.xlsx")
    assert len(rows) == 1
    assert rows[0]["billing_name"] == "Acme Ltd"
    assert rows[0]["contact_1_email"] == "jane@acme.com"


def test_import_updates_and_creates(pm_session, tmp_path, monkeypatch):
    import pandas as pd
    import io

    df = pd.DataFrame(
        [
            {
                "Customer Id": "Et-001",
                "Billing Name": "Aargee Equipments Pvt Ltd",
                "Address": "Hosur",
                "Gst Number": "GST001",
                "State": "Tamil Nadu",
                "Contact 1 Name": "Raj",
                "Contact 1 Number": "8888888888",
                "Contact 1 Email Id": "raj@aargee.com",
                "Contact 2 Name": "",
                "Contact 2 Number": "",
                "Contact 2 Email Id": "",
                "Contact 3 Name": "",
                "Contact 3 Number": "",
                "Contact 3 Email Id": "",
            },
            {
                "Customer Id": "Et-002",
                "Billing Name": "New Client Co",
                "Address": "",
                "Gst Number": "",
                "State": "Kerala",
                "Contact 1 Name": "Sam",
                "Contact 1 Number": "",
                "Contact 1 Email Id": "sam@new.com",
                "Contact 2 Name": "",
                "Contact 2 Number": "",
                "Contact 2 Email Id": "",
                "Contact 3 Name": "",
                "Contact 3 Number": "",
                "Contact 3 Email Id": "",
            },
        ]
    )
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    result = import_clients_from_contact_sheet(pm_session, buf.getvalue(), filename="clients.xlsx")
    assert result.total_rows == 2
    assert result.updated == 1
    assert result.created == 1
    assert result.errors == 0
    count = pm_session.scalar(select(func.count()).select_from(Client))
    assert count == 2
    updated = pm_session.scalar(
        select(Client).where(Client.client_name == "Aargee Equipments Pvt Ltd")
    )
    assert updated is not None
    assert updated.contact_email == "raj@aargee.com"
