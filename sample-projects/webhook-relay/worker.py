"""Background worker that drains the retry queue."""
import pickle
import tempfile
import os


def load_retry_batch(raw_bytes: bytes):
    return pickle.loads(raw_bytes)


def write_batch_marker(batch_name: str, content: str):
    path = os.path.join(tempfile.gettempdir(), f"{batch_name}.tmp")
    with open(path, "w") as f:
        f.write(content)
    return path
