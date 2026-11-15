"""Contract ids: mom_, per_, prm_, act_, rcp_ followed by [A-Za-z0-9_-]."""
import secrets


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"
